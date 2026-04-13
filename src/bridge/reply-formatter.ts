export function formatReply(input: { text: string; maxChars: number }): string {
  const normalized = input.text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "我这边没有拿到有效结果，请再试一次。";
  }
  if (normalized.length <= input.maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, input.maxChars - 20)}\n\n[内容较长，已截断]`;
}
