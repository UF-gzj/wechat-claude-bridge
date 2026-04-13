declare module "qrcode-terminal" {
  const qr: {
    generate(input: string, options?: { small?: boolean }, callback?: (qrcode: string) => void): void;
  };
  export default qr;
}

declare module "qrcode" {
  export interface ToFileOptions {
    type?: "png" | "svg" | "utf8";
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    margin?: number;
    width?: number;
  }

  const QRCode: {
    toFile(path: string, text: string, options?: ToFileOptions): Promise<void>;
  };

  export default QRCode;
}

declare module "wx-clawbot" {
  import EventEmitter from "node:events";

  export interface DownloadedMediaResult {
    buffer: Buffer;
    type: "image" | "voice" | "file" | "video";
    contentType?: string;
    filename?: string;
  }

  export interface MessageJsonItem {
    image_item?: unknown;
    file_item?: { file_name?: string };
    video_item?: unknown;
    voice_item?: unknown;
  }

  export interface MessageJson {
    message_id?: number | string;
    client_id?: string;
    from_user_id?: string;
    to_user_id?: string;
    create_time_ms?: number;
    item_list?: MessageJsonItem[];
  }

  export class Message {
    text: string;
    voiceText: string;
    hasMedia: boolean;
    downloadMedia(): Promise<DownloadedMediaResult | void>;
    sendText(text: string): Promise<void>;
    sendTyping(): Promise<void>;
    stopTyping(): Promise<void>;
    toJSON(): MessageJson;
  }

  export interface WechatBotOptions {
    configFilePath?: string;
  }

  export interface WechatBotEvents {
    scan: [{ url: string }];
    scaned: [];
    connected: [];
    logout: [];
    message: [Message];
    error: [Error];
  }

  export class WechatBot extends EventEmitter {
    constructor(options?: WechatBotOptions);
    ensureLogin(): this;
    close(): void;
    on<K extends keyof WechatBotEvents>(event: K, listener: (...args: WechatBotEvents[K]) => void): this;
  }
}
