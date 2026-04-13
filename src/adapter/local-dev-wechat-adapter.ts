import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { WechatAdapter } from "./wechat-adapter.interface.js";
import type { DownloadedArtifact } from "../types/artifact.js";
import type { AppConfig } from "../types/config.js";
import type { IncomingWechatMessage, OutgoingTextMessage } from "../types/message.js";

export class LocalDevWechatAdapter implements WechatAdapter {
  private readonly inboxDir: string;
  private readonly outboxDir: string;
  private readonly processedDir: string;
  private readonly pollIntervalMs: number;
  private handler?: (message: IncomingWechatMessage) => Promise<void>;
  private timer?: NodeJS.Timeout;
  private readonly inFlight = new Set<string>();

  constructor(config: AppConfig) {
    this.inboxDir = config.wechat.devInboxDir;
    this.outboxDir = config.wechat.devOutboxDir;
    this.processedDir = config.wechat.devProcessedDir;
    this.pollIntervalMs = config.wechat.pollIntervalMs;
  }

  onMessage(handler: (message: IncomingWechatMessage) => Promise<void>): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    await Promise.all([
      mkdir(this.inboxDir, { recursive: true }),
      mkdir(this.outboxDir, { recursive: true }),
      mkdir(this.processedDir, { recursive: true }),
    ]);
    await this.pollOnce();
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.pollIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async sendText(message: OutgoingTextMessage): Promise<void> {
    const fileName = `${Date.now()}-${sanitizeName(message.peerId)}.json`;
    const outPath = path.join(this.outboxDir, fileName);
    await writeFile(
      outPath,
      `${JSON.stringify({ peerId: message.peerId, text: message.text, createdAt: new Date().toISOString() }, null, 2)}\n`,
      "utf8",
    );
  }

  async sendTyping(_peerId: string): Promise<void> {
    // Local dev mode has no native typing indicator channel.
  }

  async stopTyping(_peerId: string): Promise<void> {
    // Local dev mode has no native typing indicator channel.
  }

  async downloadAttachment(input: {
    message: IncomingWechatMessage;
    attachmentId: string;
  }): Promise<DownloadedArtifact> {
    const attachment = input.message.attachments.find((item) => item.id === input.attachmentId);
    if (!attachment) {
      throw new Error(`Attachment ${input.attachmentId} not found in message ${input.message.messageId}.`);
    }
    if (!attachment.sourcePath) {
      throw new Error(`Attachment ${input.attachmentId} is missing sourcePath.`);
    }
    return {
      id: attachment.id,
      type: attachment.type,
      originName: attachment.originName,
      mimeType: attachment.mimeType,
      sourcePath: path.resolve(attachment.sourcePath),
    };
  }

  private async pollOnce(): Promise<void> {
    if (!this.handler) {
      return;
    }

    const files = await readdir(this.inboxDir, { withFileTypes: true });
    const jsonFiles = files
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort();

    for (const fileName of jsonFiles) {
      const fullPath = path.join(this.inboxDir, fileName);
      if (this.inFlight.has(fullPath)) {
        continue;
      }

      this.inFlight.add(fullPath);
      try {
        const raw = await readFile(fullPath, "utf8");
        const message = JSON.parse(raw) as IncomingWechatMessage;
        await this.handler(message);
        const processedName = `${Date.now()}-${fileName}`;
        await rename(fullPath, path.join(this.processedDir, processedName));
      } finally {
        this.inFlight.delete(fullPath);
      }
    }
  }
}

function sanitizeName(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]+/g, "_");
}
