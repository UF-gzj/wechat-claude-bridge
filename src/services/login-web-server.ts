import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { AppConfig } from "../types/config.js";
import type { WechatAdapterStatus } from "../types/wechat-status.js";
import { WechatStatusStore } from "./wechat-status-store.js";

export class LoginWebServer {
  private server = createServer((req, res) => {
    void this.handle(req, res);
  });
  private readonly statusStore: WechatStatusStore;
  private readonly qrDir: string;

  constructor(private readonly config: AppConfig) {
    this.qrDir = path.dirname(config.wechat.sessionFile);
    this.statusStore = new WechatStatusStore(path.join(this.qrDir, "login-status.json"));
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.config.server.port, "127.0.0.1", () => {
        this.server.off("error", reject);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? "/";
    if (url === "/status") {
      return this.serveStatus(res);
    }
    if (url.startsWith("/qr.png")) {
      return this.serveQrImage(res);
    }
    return this.serveIndex(res);
  }

  private async serveStatus(res: ServerResponse): Promise<void> {
    const status = await this.readStatus();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(`${JSON.stringify(status, null, 2)}\n`);
  }

  private async serveQrImage(res: ServerResponse): Promise<void> {
    const pngPath = path.join(this.qrDir, "login-qr.png");
    try {
      const file = await readFile(pngPath);
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      });
      res.end(file);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("QR image not ready yet.");
    }
  }

  private async serveIndex(res: ServerResponse): Promise<void> {
    const status = await this.readStatus();
    const qrExists = await exists(path.join(this.qrDir, "login-qr.png"));
    const html = renderHtml({
      port: this.config.server.port,
      status,
      qrExists,
    });
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  }

  private async readStatus(): Promise<WechatAdapterStatus> {
    try {
      return await this.statusStore.read();
    } catch {
      return {
        state: "starting",
        updatedAt: new Date().toISOString(),
        sessionFile: this.config.wechat.sessionFile,
        qrImagePath: path.join(this.qrDir, "login-qr.png"),
        qrTextPath: path.join(this.qrDir, "login-qr.txt"),
      };
    }
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function renderHtml(input: {
  port: number;
  status: WechatAdapterStatus;
  qrExists: boolean;
}): string {
  const { status, qrExists, port } = input;
  const qrBlock = status.state === "connected"
    ? `<div class="placeholder success">微信已连接，无需再次扫码。</div>`
    : qrExists
      ? `<img src="/qr.png?t=${encodeURIComponent(status.updatedAt)}" alt="WeChat Login QR" class="qr" />`
      : `<div class="placeholder">二维码暂未生成，请稍等刷新。</div>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="4" />
  <title>微信登录</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f1e8;
      --panel: #fffdf9;
      --ink: #1c241d;
      --accent: #0f7b4d;
      --muted: #6d746d;
      --line: #d8d1c1;
    }
    body {
      margin: 0;
      font-family: "Microsoft YaHei UI", "PingFang SC", sans-serif;
      background: radial-gradient(circle at top, #fff7dc, var(--bg));
      color: var(--ink);
    }
    .wrap {
      max-width: 920px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 24px;
      box-shadow: 0 18px 50px rgba(40, 44, 26, 0.08);
    }
    h1 {
      margin: 0 0 10px;
      font-size: 28px;
    }
    .sub {
      margin: 0 0 24px;
      color: var(--muted);
    }
    .grid {
      display: grid;
      gap: 24px;
      grid-template-columns: 360px 1fr;
    }
    .qr {
      width: 100%;
      max-width: 320px;
      border-radius: 18px;
      border: 10px solid white;
      background: white;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.08);
    }
    .placeholder {
      width: 320px;
      height: 320px;
      display: grid;
      place-items: center;
      border: 2px dashed var(--line);
      border-radius: 18px;
      color: var(--muted);
      background: #fff;
    }
    .placeholder.success {
      border-style: solid;
      border-color: #c6e9d6;
      color: #0f7b4d;
      background: #eefbf3;
      font-weight: 700;
      text-align: center;
      padding: 24px;
      box-sizing: border-box;
    }
    .badge {
      display: inline-block;
      padding: 8px 12px;
      border-radius: 999px;
      background: #e6f7ef;
      color: var(--accent);
      font-weight: 700;
      margin-bottom: 12px;
    }
    dl {
      margin: 0;
      display: grid;
      grid-template-columns: 130px 1fr;
      gap: 10px 12px;
      font-size: 14px;
    }
    dt {
      color: var(--muted);
    }
    dd {
      margin: 0;
      word-break: break-all;
    }
    .tips {
      margin-top: 20px;
      padding: 16px;
      background: #f6fbf8;
      border-radius: 16px;
      border: 1px solid #d9ece1;
      font-size: 14px;
      line-height: 1.7;
    }
    @media (max-width: 760px) {
      .grid {
        grid-template-columns: 1fr;
      }
      .placeholder, .qr {
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>微信登录页面</h1>
      <p class="sub">本地桥接服务已启动。请用手机微信扫码登录。页面会每 4 秒自动刷新。</p>
      <div class="grid">
        <div>${qrBlock}</div>
        <div>
          <div class="badge">当前状态：${escapeHtml(status.state)}</div>
          <dl>
            <dt>服务地址</dt>
            <dd>http://127.0.0.1:${port}</dd>
            <dt>更新时间</dt>
            <dd>${escapeHtml(status.updatedAt)}</dd>
            <dt>会话文件</dt>
            <dd>${escapeHtml(status.sessionFile ?? "-")}</dd>
            <dt>二维码图片</dt>
            <dd>${escapeHtml(status.qrImagePath ?? "-")}</dd>
            <dt>最近联系人</dt>
            <dd>${escapeHtml(status.lastPeerId ?? "-")}</dd>
            <dt>最近消息时间</dt>
            <dd>${escapeHtml(status.lastInboundAt ?? "-")}</dd>
            <dt>最近错误</dt>
            <dd>${escapeHtml(status.lastError ?? "-")}</dd>
          </dl>
          <div class="tips">
            1. 状态为 <strong>waiting_for_scan</strong> 时，请直接扫码。<br />
            2. 状态为 <strong>scanned</strong> 时，请在手机微信上点击确认。<br />
            3. 状态为 <strong>connected</strong> 时，说明已经接入成功，可以开始发消息测试。<br />
            4. 如果页面显示已连接，就不用再扫二维码。<br />
            5. 如果确实需要重新扫码，请删除会话文件后重启服务。
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
