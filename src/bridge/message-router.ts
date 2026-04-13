import path from "node:path";

import type { Logger } from "pino";

import type { WechatAdapter } from "../adapter/wechat-adapter.interface.js";
import type { StoredArtifact } from "../types/artifact.js";
import type { AppConfig } from "../types/config.js";
import type { IncomingWechatMessage } from "../types/message.js";
import { ClaudeRunner } from "../runner/claude-runner.js";
import { ArtifactCache } from "../services/artifact-cache.js";
import { FilePreprocessService } from "../services/file-preprocess.js";
import { buildSessionKey, SessionStore } from "../services/session-store.js";
import { buildArtifactPrompt, buildTextPrompt } from "./prompt-builder.js";
import { formatReply } from "./reply-formatter.js";

export class MessageRouter {
  private readonly preprocess: FilePreprocessService;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly adapter: WechatAdapter,
    private readonly sessionStore: SessionStore,
    private readonly artifactCache: ArtifactCache,
    private readonly claudeRunner: ClaudeRunner,
  ) {
    this.preprocess = new FilePreprocessService(path.join(config.paths.cacheDir, "temp"));
  }

  async handleMessage(message: IncomingWechatMessage): Promise<void> {
    const session = await this.sessionStore.getOrCreate(message);
    const sessionKey = buildSessionKey(message.wechatAccountId, message.peerId);
    await this.sessionStore.markRunning(sessionKey);
    const receiptSentAt = Date.now();
    let typingStarted = false;

    try {
      this.logger.info({ messageId: message.messageId, messageType: message.messageType }, "Processing message");
      if (this.adapter.sendTyping) {
        this.logger.info({ messageId: message.messageId, peerId: message.peerId }, "Starting typing indicator");
        await this.adapter.sendTyping(message.peerId);
        typingStarted = true;
      }
      this.logger.info({ messageId: message.messageId, peerId: message.peerId }, "Sending receipt message");
      await this.adapter.sendText({
        peerId: message.peerId,
        text: this.config.wechat.receiptMessage,
      });
      const storedArtifacts = await this.loadArtifacts(message);
      const prompt = storedArtifacts.length
        ? buildArtifactPrompt({
            summary: session.summary,
            question: message.text,
            contexts: await Promise.all(storedArtifacts.map((artifact) => this.preprocess.prepare(artifact))),
            type: storedArtifacts[0]?.type === "image" ? "image" : "file",
          })
        : buildTextPrompt({
            summary: session.summary,
            text: message.text,
          });

      const result = await this.claudeRunner.run(prompt);
      const reply = formatReply({
        text: result.text,
        maxChars: this.config.limits.maxReplyChars,
      });

      await waitForMinimumReceiptWindow(receiptSentAt, this.config.wechat.minReceiptVisibleMs);
      if (typingStarted && this.adapter.stopTyping) {
        await this.adapter.stopTyping(message.peerId);
      }
      this.logger.info({ messageId: message.messageId, peerId: message.peerId }, "Sending final reply");
      await this.adapter.sendText({
        peerId: message.peerId,
        text: reply,
      });

      await this.sessionStore.appendExchange({
        sessionKey,
        userText: describeUserInput(message, storedArtifacts),
        assistantText: reply,
        artifacts: storedArtifacts,
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      this.logger.error({ err: error, messageId: message.messageId }, "Failed to process message");
      await this.sessionStore.markError(sessionKey, messageText);
      await waitForMinimumReceiptWindow(receiptSentAt, this.config.wechat.minReceiptVisibleMs);
      if (typingStarted && this.adapter.stopTyping) {
        await this.adapter.stopTyping(message.peerId);
      }
      this.logger.info({ messageId: message.messageId, peerId: message.peerId }, "Sending failure reply");
      await this.adapter.sendText({
        peerId: message.peerId,
        text: toUserFacingError(messageText),
      });
    }
  }

  private async loadArtifacts(message: IncomingWechatMessage): Promise<StoredArtifact[]> {
    const stored: StoredArtifact[] = [];
    for (const attachment of message.attachments) {
      const downloaded = await this.adapter.downloadAttachment({
        message,
        attachmentId: attachment.id,
      });
      const cached = await this.artifactCache.importArtifact(downloaded);
      stored.push(cached);
    }
    return stored;
  }
}

function describeUserInput(message: IncomingWechatMessage, artifacts: StoredArtifact[]): string {
  if (!artifacts.length) {
    return message.text;
  }
  const artifactList = artifacts.map((artifact) => `${artifact.type}:${artifact.originName}`).join(", ");
  return `${message.text}\n\nAttachments: ${artifactList}`;
}

function toUserFacingError(rawError: string): string {
  const normalized = rawError.toLowerCase();

  if (normalized.includes("timed out")) {
    return "已收到，但这次处理超时了，请稍后重试一次。";
  }

  if (normalized.includes("enoent") || normalized.includes("cannot find")) {
    return "已收到，但处理所需的文件没有找到，请重新发送后再试。";
  }

  if (normalized.includes("permission") || normalized.includes("denied") || normalized.includes("not granted")) {
    return "已收到，但当前没有访问目标文件或目录的权限。";
  }

  if (normalized.includes("does not contain downloadable media")) {
    return "已收到，但这条消息里的附件暂时没有成功读取。";
  }

  if (normalized.includes("exceeds the configured size limit")) {
    return "已收到，但附件太大了，超出了当前处理限制。";
  }

  if (normalized.includes("image") && normalized.includes("read")) {
    return "已收到，但这张图片暂时没有成功解析。";
  }

  return "已收到，但这次处理失败了，请稍后再试。";
}

async function waitForMinimumReceiptWindow(startedAtMs: number, minVisibleMs: number): Promise<void> {
  const elapsed = Date.now() - startedAtMs;
  const remaining = minVisibleMs - elapsed;
  if (remaining <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, remaining));
}
