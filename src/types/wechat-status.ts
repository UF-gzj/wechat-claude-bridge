export type WechatConnectionState =
  | "starting"
  | "waiting_for_scan"
  | "scanned"
  | "connected"
  | "logout"
  | "error";

export interface WechatAdapterStatus {
  state: WechatConnectionState;
  updatedAt: string;
  qrImagePath?: string;
  qrTextPath?: string;
  sessionFile?: string;
  lastError?: string;
  lastPeerId?: string;
  lastInboundAt?: string;
}
