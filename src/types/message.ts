import type { AttachmentReference } from "./artifact.js";

export type ChatType = "direct" | "group";
export type IncomingMessageType = "text" | "image" | "file";

export interface IncomingWechatMessage {
  messageId: string;
  wechatAccountId: string;
  peerId: string;
  chatType: ChatType;
  messageType: IncomingMessageType;
  text: string;
  attachments: AttachmentReference[];
  timestamp: number;
}

export interface OutgoingTextMessage {
  peerId: string;
  text: string;
}
