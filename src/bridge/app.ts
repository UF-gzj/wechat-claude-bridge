import type { Logger } from "pino";

import { LocalDevWechatAdapter } from "../adapter/local-dev-wechat-adapter.js";
import type { WechatAdapter } from "../adapter/wechat-adapter.interface.js";
import { WxClawbotAdapter } from "../adapter/wx-clawbot-adapter.js";
import { ClaudeRunner } from "../runner/claude-runner.js";
import { ArtifactCache } from "../services/artifact-cache.js";
import { LoginWebServer } from "../services/login-web-server.js";
import { SessionStore } from "../services/session-store.js";
import type { AppConfig } from "../types/config.js";
import { MessageRouter } from "./message-router.js";

export class BridgeApplication {
  private readonly adapter: WechatAdapter;
  private readonly sessionStore: SessionStore;
  private readonly router: MessageRouter;
  private readonly loginWebServer?: LoginWebServer;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {
    this.adapter = createAdapter(config);
    this.sessionStore = new SessionStore(config.paths.dbPath);
    this.router = new MessageRouter(
      config,
      logger,
      this.adapter,
      this.sessionStore,
      new ArtifactCache(config),
      new ClaudeRunner(config),
    );
    this.loginWebServer = config.wechat.adapterMode === "wx-clawbot"
      ? new LoginWebServer(config)
      : undefined;
  }

  async start(): Promise<void> {
    await this.sessionStore.ensureReady();
    if (this.loginWebServer) {
      await this.loginWebServer.start();
      this.logger.info({ url: `http://127.0.0.1:${this.config.server.port}` }, "Login page started");
    }
    this.adapter.onMessage(async (message) => this.router.handleMessage(message));
    await this.adapter.start();
    this.logger.info({ adapterMode: this.config.wechat.adapterMode }, "Bridge application started");
  }

  async stop(): Promise<void> {
    await this.adapter.stop();
    if (this.loginWebServer) {
      await this.loginWebServer.stop();
    }
    this.logger.info("Bridge application stopped");
  }
}

function createAdapter(config: AppConfig): WechatAdapter {
  switch (config.wechat.adapterMode) {
    case "local-dev":
      return new LocalDevWechatAdapter(config);
    case "wx-clawbot":
      return new WxClawbotAdapter(config);
    default:
      throw new Error(`Unsupported adapter mode: ${config.wechat.adapterMode}`);
  }
}
