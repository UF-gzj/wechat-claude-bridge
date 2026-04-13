import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import QRCode from "qrcode";
import qr from "qrcode-terminal";
import { Message as WxMessage, WechatBot } from "wx-clawbot";

import type { WechatAdapter } from "./wechat-adapter.interface.js";
import type { AttachmentReference, DownloadedArtifact } from "../types/artifact.js";
import type { AppConfig } from "../types/config.js";
import type { IncomingWechatMessage, OutgoingTextMessage } from "../types/message.js";
import { WechatStatusStore } from "../services/wechat-status-store.js";

export class WxClawbotAdapter implements WechatAdapter {
  private readonly bot: WechatBot;
  private readonly inboundMessages = new Map<string, WxMessage>();
  private readonly replyTargets = new Map<string, WxMessage>();
  private readonly qrDir: string;
  private readonly statusStore: WechatStatusStore;
  private handler?: (message: IncomingWechatMessage) => Promise<void>;

  constructor(private readonly config: AppConfig) {
    this.qrDir = path.dirname(config.wechat.sessionFile);
    this.statusStore = new WechatStatusStore(path.join(this.qrDir, "login-status.json"));
    this.bot = new WechatBot({
      configFilePath: config.wechat.sessionFile,
    });
  }

  onMessage(handler: (message: IncomingWechatMessage) => Promise<void>): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    await mkdir(this.qrDir, { recursive: true });
    await this.statusStore.ensureReady({
      state: "starting",
      sessionFile: this.config.wechat.sessionFile,
      qrImagePath: path.join(this.qrDir, "login-qr.png"),
      qrTextPath: path.join(this.qrDir, "login-qr.txt"),
    });

    this.bot
      .on("scan", ({ url }: { url: string }) => {
        void this.persistQrAssets(url);
        void this.statusStore.update({
          state: "waiting_for_scan",
        });
        console.log("Please scan the QR code with WeChat:");
        qr.generate(url, { small: true });
      })
      .on("scaned", () => {
        void this.statusStore.update({
          state: "scanned",
        });
        console.log("QR code scanned. Please confirm login in WeChat.");
      })
      .on("connected", () => {
        void this.statusStore.update({
          state: "connected",
        });
        console.log("WeChat adapter connected.");
      })
      .on("logout", () => {
        void this.statusStore.update({
          state: "logout",
        });
        console.log("WeChat session expired. Restart and re-scan to log in again.");
      })
      .on("error", (error: Error) => {
        void this.statusStore.update({
          state: "error",
          lastError: error.message,
        });
        console.error("WeChat adapter error:", error);
      })
      .on("message", (message: WxMessage) => {
        void this.handleWxMessage(message);
      });

    this.bot.ensureLogin();
  }

  async stop(): Promise<void> {
    this.bot.close();
  }

  async sendText(message: OutgoingTextMessage): Promise<void> {
    const target = this.replyTargets.get(message.peerId);
    if (!target) {
      throw new Error(`No active reply context found for peer ${message.peerId}.`);
    }
    await target.sendText(message.text);
  }

  async sendTyping(peerId: string): Promise<void> {
    const target = this.replyTargets.get(peerId);
    if (!target) {
      throw new Error(`No active reply context found for peer ${peerId}.`);
    }
    await target.sendTyping();
  }

  async stopTyping(peerId: string): Promise<void> {
    const target = this.replyTargets.get(peerId);
    if (!target) {
      throw new Error(`No active reply context found for peer ${peerId}.`);
    }
    await target.stopTyping();
  }

  async downloadAttachment(input: {
    message: IncomingWechatMessage;
    attachmentId: string;
  }): Promise<DownloadedArtifact> {
    const target = this.inboundMessages.get(input.message.messageId);
    if (!target) {
      throw new Error(`Inbound message ${input.message.messageId} not found in adapter cache.`);
    }
    const media = await target.downloadMedia();
    if (!media) {
      throw new Error(`Message ${input.message.messageId} does not contain downloadable media.`);
    }

    const fileName = chooseFileName(media, input.attachmentId);
    const stagingDir = path.join(this.config.paths.cacheDir, "adapter-staging");
    const stagingPath = path.join(stagingDir, fileName);
    await mkdir(stagingDir, { recursive: true });
    await writeFile(stagingPath, media.buffer);

    return {
      id: input.attachmentId,
      type: media.type === "image" ? "image" : "file",
      originName: fileName,
      mimeType: media.contentType,
      sourcePath: stagingPath,
      size: media.buffer.byteLength,
    };
  }

  private async handleWxMessage(message: WxMessage): Promise<void> {
    if (!this.handler) {
      return;
    }

    const raw = message.toJSON();
    const peerId = raw.from_user_id ?? raw.to_user_id ?? `peer-${randomUUID()}`;
    const incoming: IncomingWechatMessage = {
      messageId: String(raw.message_id ?? raw.client_id ?? randomUUID()),
      wechatAccountId: "wx-clawbot",
      peerId,
      chatType: "direct",
      messageType: detectMessageType(message),
      text: message.text || message.voiceText || "",
      attachments: buildAttachments(message),
      timestamp: raw.create_time_ms ?? Date.now(),
    };

    this.inboundMessages.set(incoming.messageId, message);
    this.replyTargets.set(peerId, message);
    await this.statusStore.update({
      state: "connected",
      lastPeerId: peerId,
      lastInboundAt: new Date().toISOString(),
      lastError: undefined,
    });
    await this.handler(incoming);
  }

  private async persistQrAssets(url: string): Promise<void> {
    const pngPath = path.join(this.qrDir, "login-qr.png");
    const txtPath = path.join(this.qrDir, "login-qr.txt");
    await Promise.all([
      QRCode.toFile(pngPath, url, {
        type: "png",
        errorCorrectionLevel: "M",
        margin: 1,
        width: 420,
      }),
      writeFile(txtPath, `${url}\n`, "utf8"),
    ]);
  }
}

function detectMessageType(message: WxMessage): IncomingWechatMessage["messageType"] {
  if (message.hasMedia) {
    const raw = message.toJSON();
    const item = raw.item_list?.[0];
    if (item?.image_item) {
      return "image";
    }
    return "file";
  }
  return "text";
}

function buildAttachments(message: WxMessage): AttachmentReference[] {
  if (!message.hasMedia) {
    return [];
  }
  const raw = message.toJSON();
  const item = raw.item_list?.find((entry) => entry.image_item || entry.file_item || entry.video_item || entry.voice_item);
  if (!item) {
    return [];
  }

  const isImage = Boolean(item.image_item);
  const originName = item.file_item?.file_name || defaultMediaName(item, isImage);

  return [
    {
      id: String(raw.message_id ?? raw.client_id ?? randomUUID()),
      type: isImage ? "image" : "file",
      originName,
      mimeType: guessMime(item, originName),
    },
  ];
}

function defaultMediaName(
  item: NonNullable<ReturnType<WxMessage["toJSON"]>["item_list"]>[number],
  isImage: boolean,
): string {
  if (isImage) {
    return "image.jpg";
  }
  if (item.video_item) {
    return "video.mp4";
  }
  if (item.voice_item) {
    return "voice.wav";
  }
  return "attachment.bin";
}

function chooseFileName(
  media: Awaited<ReturnType<WxMessage["downloadMedia"]>>,
  attachmentId: string,
): string {
  if (!media) {
    return `${attachmentId}.bin`;
  }
  const ext = extensionFromContentType(media.contentType, media.type);
  return media.filename || `${attachmentId}${ext}`;
}

function guessMime(
  item: NonNullable<ReturnType<WxMessage["toJSON"]>["item_list"]>[number],
  originName: string,
): string | undefined {
  if (item.image_item) return "image/jpeg";
  if (item.video_item) return "video/mp4";
  if (item.voice_item) return "audio/wav";
  return extensionToMime(path.extname(originName).toLowerCase());
}

function extensionFromContentType(contentType: string | undefined, type: string): string {
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return ".jpg";
  if (contentType?.includes("pdf")) return ".pdf";
  if (contentType?.includes("plain")) return ".txt";
  if (contentType?.includes("csv")) return ".csv";
  if (contentType?.includes("mp4")) return ".mp4";
  if (contentType?.includes("wav")) return ".wav";
  return type === "image" ? ".jpg" : ".bin";
}

function extensionToMime(ext: string): string | undefined {
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".txt":
      return "text/plain";
    case ".csv":
      return "text/csv";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return undefined;
  }
}
