import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { StoredArtifact } from "../types/artifact.js";
import type { IncomingWechatMessage } from "../types/message.js";

export interface SessionRecord {
  sessionKey: string;
  wechatAccountId: string;
  peerId: string;
  summary: string;
  recentMessages: string[];
  recentArtifacts: StoredArtifact[];
  status: "idle" | "running" | "error";
  lastActiveAt: string;
  lastError?: string;
}

interface SessionDb {
  sessions: Record<string, SessionRecord>;
}

export class SessionStore {
  constructor(private readonly dbPath: string) {}

  async ensureReady(): Promise<void> {
    await mkdir(path.dirname(this.dbPath), { recursive: true });
    try {
      await readFile(this.dbPath, "utf8");
    } catch {
      await this.save({ sessions: {} });
    }
  }

  async getOrCreate(message: IncomingWechatMessage): Promise<SessionRecord> {
    const db = await this.load();
    const sessionKey = buildSessionKey(message.wechatAccountId, message.peerId);
    const existing = db.sessions[sessionKey];
    if (existing) {
      return existing;
    }

    const created: SessionRecord = {
      sessionKey,
      wechatAccountId: message.wechatAccountId,
      peerId: message.peerId,
      summary: "",
      recentMessages: [],
      recentArtifacts: [],
      status: "idle",
      lastActiveAt: new Date().toISOString(),
    };
    db.sessions[sessionKey] = created;
    await this.save(db);
    return created;
  }

  async markRunning(sessionKey: string): Promise<void> {
    await this.patch(sessionKey, (session) => {
      session.status = "running";
      session.lastActiveAt = new Date().toISOString();
      delete session.lastError;
    });
  }

  async markError(sessionKey: string, errorMessage: string): Promise<void> {
    await this.patch(sessionKey, (session) => {
      session.status = "error";
      session.lastError = errorMessage;
      session.lastActiveAt = new Date().toISOString();
    });
  }

  async appendExchange(input: {
    sessionKey: string;
    userText: string;
    assistantText: string;
    artifacts?: StoredArtifact[];
  }): Promise<void> {
    await this.patch(input.sessionKey, (session) => {
      session.status = "idle";
      session.lastActiveAt = new Date().toISOString();
      session.recentMessages.push(`User: ${compact(input.userText)}`);
      session.recentMessages.push(`Assistant: ${compact(input.assistantText)}`);
      session.recentMessages = session.recentMessages.slice(-12);
      if (input.artifacts?.length) {
        session.recentArtifacts.push(...input.artifacts);
        session.recentArtifacts = session.recentArtifacts.slice(-6);
      }
      session.summary = session.recentMessages.slice(-6).join("\n");
    });
  }

  private async patch(sessionKey: string, updater: (session: SessionRecord) => void): Promise<void> {
    const db = await this.load();
    const session = db.sessions[sessionKey];
    if (!session) {
      throw new Error(`Session ${sessionKey} not found.`);
    }
    updater(session);
    await this.save(db);
  }

  private async load(): Promise<SessionDb> {
    const raw = await readFile(this.dbPath, "utf8");
    return JSON.parse(raw) as SessionDb;
  }

  private async save(data: SessionDb): Promise<void> {
    await writeFile(this.dbPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}

export function buildSessionKey(wechatAccountId: string, peerId: string): string {
  return `${wechatAccountId}:${peerId}`;
}

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 300);
}
