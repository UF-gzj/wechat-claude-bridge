import type { DownloadedArtifact } from "../types/artifact.js";
import type { IncomingWechatMessage, OutgoingTextMessage } from "../types/message.js";

export interface WechatAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: (message: IncomingWechatMessage) => Promise<void>): void;
  sendText(message: OutgoingTextMessage): Promise<void>;
  sendTyping?(peerId: string): Promise<void>;
  stopTyping?(peerId: string): Promise<void>;
  downloadAttachment(input: { message: IncomingWechatMessage; attachmentId: string }): Promise<DownloadedArtifact>;
}
