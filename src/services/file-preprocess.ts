import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import mammoth from "mammoth";
import xlsx from "xlsx";

import type { StoredArtifact } from "../types/artifact.js";

export interface PreparedArtifactContext {
  originalPath: string;
  claudeReferencePath: string;
  notes: string[];
  wasPreprocessed: boolean;
}

export class FilePreprocessService {
  constructor(private readonly tempDir: string) {}

  async prepare(artifact: StoredArtifact): Promise<PreparedArtifactContext> {
    await mkdir(this.tempDir, { recursive: true });

    if (artifact.type === "image") {
      return {
        originalPath: artifact.localPath,
        claudeReferencePath: artifact.localPath,
        notes: ["Image passed directly to Claude Code CLI."],
        wasPreprocessed: false,
      };
    }

    const ext = path.extname(artifact.localPath).toLowerCase();
    switch (ext) {
      case ".txt":
      case ".md":
      case ".json":
      case ".pdf":
        return {
          originalPath: artifact.localPath,
          claudeReferencePath: artifact.localPath,
          notes: ["File passed directly to Claude Code CLI."],
          wasPreprocessed: false,
        };
      case ".csv":
        return this.prepareCsv(artifact);
      case ".docx":
        return this.prepareDocx(artifact);
      case ".xlsx":
      case ".xls":
        return this.prepareSpreadsheet(artifact);
      default:
        return {
          originalPath: artifact.localPath,
          claudeReferencePath: artifact.localPath,
          notes: [`Unsupported preprocess format ${ext}; file passed directly.`],
          wasPreprocessed: false,
        };
    }
  }

  private async prepareCsv(artifact: StoredArtifact): Promise<PreparedArtifactContext> {
    const raw = await readFile(artifact.localPath, "utf8");
    const preview = raw.split(/\r?\n/).slice(0, 80).join("\n");
    const outPath = path.join(this.tempDir, `${artifact.sha256}.csv.preview.txt`);
    await writeFile(outPath, preview, "utf8");
    return {
      originalPath: artifact.localPath,
      claudeReferencePath: outPath,
      notes: ["CSV preprocessed into a preview text file with the first 80 lines."],
      wasPreprocessed: true,
    };
  }

  private async prepareDocx(artifact: StoredArtifact): Promise<PreparedArtifactContext> {
    const result = await mammoth.extractRawText({ path: artifact.localPath });
    const text = result.value.trim() || "[No extractable text found in DOCX.]";
    const outPath = path.join(this.tempDir, `${artifact.sha256}.docx.txt`);
    await writeFile(outPath, text, "utf8");
    return {
      originalPath: artifact.localPath,
      claudeReferencePath: outPath,
      notes: ["DOCX converted to plain text via mammoth."],
      wasPreprocessed: true,
    };
  }

  private async prepareSpreadsheet(artifact: StoredArtifact): Promise<PreparedArtifactContext> {
    const workbook = xlsx.readFile(artifact.localPath, { cellDates: true });
    const parts: string[] = [];
    for (const sheetName of workbook.SheetNames.slice(0, 3)) {
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }).slice(0, 40);
      parts.push(`# Sheet: ${sheetName}`);
      for (const row of rows) {
        parts.push(JSON.stringify(row));
      }
      parts.push("");
    }
    const outPath = path.join(this.tempDir, `${artifact.sha256}.xlsx.preview.txt`);
    await writeFile(outPath, parts.join("\n"), "utf8");
    return {
      originalPath: artifact.localPath,
      claudeReferencePath: outPath,
      notes: ["Spreadsheet converted to JSON-like text preview of the first 3 sheets."],
      wasPreprocessed: true,
    };
  }
}
