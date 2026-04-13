import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

import type { AppConfig } from "../types/config.js";

export interface ClaudeRunResult {
  raw: string;
  text: string;
}

export class ClaudeRunner {
  constructor(private readonly config: AppConfig) {}

  async run(prompt: string): Promise<ClaudeRunResult> {
    const cliArgs = [
      "-p",
      "--output-format",
      this.config.claude.outputFormat,
      "--add-dir",
      this.config.paths.cacheDir,
      "--add-dir",
      this.config.paths.workspaceRoot,
    ];
    const spawnCommand = resolveClaudeCommand(this.config.claude.command);
    const command = spawnCommand.command;
    const args = [...spawnCommand.prefixArgs, ...cliArgs];

    return new Promise<ClaudeRunResult>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: this.config.paths.projectRoot,
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Claude command timed out after ${this.config.claude.timeoutMs}ms.`));
      }, this.config.claude.timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.stdin.write(prompt, "utf8");
      child.stdin.end();

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`Claude command failed with exit code ${code}: ${stderr || stdout}`));
          return;
        }
        const raw = stdout.trim();
        resolve({
          raw,
          text: extractText(raw),
        });
      });
    });
  }
}

function extractText(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { result?: string; content?: Array<{ text?: string }> };
    if (typeof parsed.result === "string" && parsed.result.trim()) {
      return parsed.result.trim();
    }
    if (Array.isArray(parsed.content)) {
      const text = parsed.content.map((item) => item.text).filter(Boolean).join("\n").trim();
      if (text) {
        return text;
      }
    }
  } catch {
    return raw;
  }
  return raw;
}

function resolveClaudeCommand(configuredCommand: string): { command: string; prefixArgs: string[] } {
  const resolved = resolveCommandPath(configuredCommand);
  if (resolved && process.platform === "win32") {
    const ext = path.extname(resolved).toLowerCase();
    if (ext === ".ps1") {
      return {
        command: "powershell",
        prefixArgs: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolved],
      };
    }
    if (ext === ".cmd" || ext === ".bat") {
      return {
        command: "cmd.exe",
        prefixArgs: ["/d", "/s", "/c", resolved],
      };
    }
  }
  return {
    command: resolved ?? configuredCommand,
    prefixArgs: [],
  };
}

function resolveCommandPath(command: string): string | null {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(locator, [command], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    return null;
  }
  const candidates = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (process.platform === "win32") {
    const preferred = candidates.find((item) => {
      const ext = path.extname(item).toLowerCase();
      return ext === ".cmd" || ext === ".exe" || ext === ".bat" || ext === ".ps1";
    });
    return preferred ?? candidates[0] ?? null;
  }
  return candidates[0] ?? null;
}
