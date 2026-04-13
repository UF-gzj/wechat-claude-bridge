import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { WechatAdapterStatus, WechatConnectionState } from "../types/wechat-status.js";

export class WechatStatusStore {
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async ensureReady(initial?: Partial<WechatAdapterStatus>): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await this.read();
    } catch {
      await this.write({
        state: "starting",
        updatedAt: new Date().toISOString(),
        ...initial,
      });
    }
  }

  async update(patch: Partial<WechatAdapterStatus> & { state?: WechatConnectionState }): Promise<void> {
    this.pending = this.pending.then(async () => {
      const current = await this.readSafe();
      await this.write({
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
    });
    await this.pending;
  }

  async read(): Promise<WechatAdapterStatus> {
    const raw = await readFile(this.filePath, "utf8");
    return JSON.parse(raw) as WechatAdapterStatus;
  }

  get path(): string {
    return this.filePath;
  }

  private async write(status: WechatAdapterStatus): Promise<void> {
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
    await rename(tempPath, this.filePath);
  }

  private async readSafe(): Promise<WechatAdapterStatus> {
    try {
      return await this.read();
    } catch {
      return {
        state: "starting",
        updatedAt: new Date().toISOString(),
      };
    }
  }
}
