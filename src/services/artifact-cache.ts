import { copyFile, mkdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import type { DownloadedArtifact, StoredArtifact } from "../types/artifact.js";
import type { AppConfig } from "../types/config.js";

export class ArtifactCache {
  constructor(private readonly config: AppConfig) {}

  async importArtifact(downloaded: DownloadedArtifact): Promise<StoredArtifact> {
    const hash = await sha256File(downloaded.sourcePath);
    const sourceStats = await stat(downloaded.sourcePath);
    const limitMb = downloaded.type === "image"
      ? this.config.limits.maxImageSizeMb
      : this.config.limits.maxFileSizeMb;
    const limitBytes = limitMb * 1024 * 1024;

    if (sourceStats.size > limitBytes) {
      throw new Error(`${downloaded.originName} exceeds the configured size limit of ${limitMb}MB.`);
    }

    const dateFolder = new Date().toISOString().slice(0, 10);
    const ext = normalizeExtension(path.extname(downloaded.originName));
    const kindDir = downloaded.type === "image" ? "images" : "files";
    const targetDir = path.join(this.config.paths.cacheDir, kindDir, dateFolder);
    const targetPath = path.join(targetDir, `${hash}${ext}`);

    await mkdir(targetDir, { recursive: true });
    await copyFile(downloaded.sourcePath, targetPath);

    return {
      id: downloaded.id,
      type: downloaded.type,
      originName: downloaded.originName,
      mimeType: downloaded.mimeType,
      localPath: targetPath,
      size: sourceStats.size,
      sha256: hash,
      createdAt: new Date().toISOString(),
    };
  }
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function normalizeExtension(ext: string): string {
  if (!ext) {
    return ".bin";
  }
  return ext.replace(/[^a-zA-Z0-9.]/g, "") || ".bin";
}
