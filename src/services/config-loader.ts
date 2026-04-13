import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";

import { appConfigSchema, type AppConfig } from "../types/config.js";

export async function loadConfig(projectRoot: string): Promise<AppConfig> {
  dotenv.config({ path: path.join(projectRoot, ".env") });

  const defaultConfigPath = path.join(projectRoot, "config", "default.json");
  const rawDefaultConfig = await readFile(defaultConfigPath, "utf8");
  const base = JSON.parse(rawDefaultConfig) as Record<string, unknown>;

  const config = appConfigSchema.parse({
    server: {
      port: readNumber("PORT", base, "server.port"),
    },
    claude: {
      command: envOr("CLAUDE_COMMAND", readString(base, "claude.command")),
      outputFormat: "json",
      timeoutMs: readNumber("REQUEST_TIMEOUT_MS", base, "claude.timeoutMs"),
    },
    paths: {
      projectRoot,
      dataDir: resolvePath(projectRoot, envOr("DATA_DIR", readString(base, "paths.dataDir"))),
      cacheDir: resolvePath(projectRoot, envOr("CACHE_DIR", readString(base, "paths.cacheDir"))),
      logDir: resolvePath(projectRoot, envOr("LOG_DIR", readString(base, "paths.logDir"))),
      dbPath: resolvePath(projectRoot, envOr("DB_PATH", readString(base, "paths.dbPath"))),
      workspaceRoot: resolvePath(projectRoot, envOr("WORKSPACE_ROOT", readString(base, "paths.workspaceRoot"))),
    },
    limits: {
      maxImageSizeMb: readNumber("MAX_IMAGE_SIZE_MB", base, "limits.maxImageSizeMb"),
      maxFileSizeMb: readNumber("MAX_FILE_SIZE_MB", base, "limits.maxFileSizeMb"),
      maxReplyChars: readNumber("MAX_REPLY_CHARS", base, "limits.maxReplyChars"),
    },
    wechat: {
      adapterMode: envOr("WECHAT_ADAPTER_MODE", readString(base, "wechat.adapterMode")),
      pollIntervalMs: readNumber("POLL_INTERVAL_MS", base, "wechat.pollIntervalMs"),
      devInboxDir: resolvePath(projectRoot, envOr("DEV_INBOX_DIR", readString(base, "wechat.devInboxDir"))),
      devOutboxDir: resolvePath(projectRoot, envOr("DEV_OUTBOX_DIR", readString(base, "wechat.devOutboxDir"))),
      devProcessedDir: resolvePath(projectRoot, envOr("DEV_PROCESSED_DIR", readString(base, "wechat.devProcessedDir"))),
      sessionFile: resolvePath(projectRoot, envOr("WECHAT_SESSION_FILE", readString(base, "wechat.sessionFile"))),
      receiptMessage: envOr("WECHAT_RECEIPT_MESSAGE", readString(base, "wechat.receiptMessage")),
      minReceiptVisibleMs: readNumber("WECHAT_MIN_RECEIPT_VISIBLE_MS", base, "wechat.minReceiptVisibleMs"),
    },
  });

  await Promise.all([
    mkdir(config.paths.dataDir, { recursive: true }),
    mkdir(config.paths.cacheDir, { recursive: true }),
    mkdir(config.paths.logDir, { recursive: true }),
    mkdir(path.dirname(config.paths.dbPath), { recursive: true }),
    mkdir(config.paths.workspaceRoot, { recursive: true }),
    mkdir(config.wechat.devInboxDir, { recursive: true }),
    mkdir(config.wechat.devOutboxDir, { recursive: true }),
    mkdir(config.wechat.devProcessedDir, { recursive: true }),
    mkdir(path.dirname(config.wechat.sessionFile), { recursive: true }),
  ]);

  return config;
}

function envOr(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

function readNumber(envKey: string, obj: Record<string, unknown>, dottedPath: string): number {
  const envValue = process.env[envKey];
  if (envValue != null && envValue !== "") {
    return Number(envValue);
  }
  return Number(readValue(obj, dottedPath));
}

function readString(obj: Record<string, unknown>, dottedPath: string): string {
  return String(readValue(obj, dottedPath));
}

function readValue(obj: Record<string, unknown>, dottedPath: string): unknown {
  return dottedPath.split(".").reduce<unknown>((current, key) => {
    if (typeof current !== "object" || current === null || !(key in current)) {
      throw new Error(`Missing configuration path: ${dottedPath}`);
    }
    return (current as Record<string, unknown>)[key];
  }, obj);
}

function resolvePath(projectRoot: string, configuredPath: string): string {
  return path.isAbsolute(configuredPath) ? configuredPath : path.resolve(projectRoot, configuredPath);
}
