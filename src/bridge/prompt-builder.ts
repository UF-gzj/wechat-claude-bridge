import path from "node:path";

import type { PreparedArtifactContext } from "../services/file-preprocess.js";

export function buildTextPrompt(input: { summary: string; text: string }): string {
  return [
    "你是一个微信中的中文智能助手。",
    "",
    "最近会话摘要：",
    input.summary || "暂无历史摘要。",
    "",
    "用户消息：",
    input.text || "（空消息）",
    "",
    "要求：",
    "1. 用中文回答",
    "2. 先给结论",
    "3. 简洁，适合微信阅读",
    "4. 如果不确定，明确说明",
  ].join("\n");
}

export function buildArtifactPrompt(input: {
  summary: string;
  question: string;
  contexts: PreparedArtifactContext[];
  type: "image" | "file";
}): string {
  const header = input.type === "image"
    ? "请分析下面的图片资源，并回答用户问题。"
    : "请分析下面的文件资源，并回答用户问题。";

  const references = input.contexts.flatMap((context) => {
    const normalized = normalizeForClaude(context.claudeReferencePath);
    return [`@${normalized}`];
  });

  const notes = input.contexts.map((context, index) => {
    return [
      `资源 ${index + 1}:`,
      `- 原始路径: ${context.originalPath}`,
      `- 当前分析文件: ${context.claudeReferencePath}`,
      ...context.notes.map((note) => `- 说明: ${note}`),
    ].join("\n");
  });

  return [
    "你是一个微信中的中文智能助手。",
    "",
    "下面这些资源已经作为本地附件提供给你：",
    ...references,
    "",
    "最近会话摘要：",
    input.summary || "暂无历史摘要。",
    "",
    header,
    "",
    ...notes,
    "",
    "用户问题：",
    input.question || "请总结资源的主要内容。",
    "",
    "要求：",
    "1. 基于资源实际内容回答",
    "2. 不要虚构资源中不存在的信息",
    "3. 先给结论",
    "4. 如有不确定信息，单独说明",
  ].join("\n");
}

function normalizeForClaude(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, "/");
}
