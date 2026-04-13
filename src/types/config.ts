import { z } from "zod";

export const appConfigSchema = z.object({
  server: z.object({
    port: z.number().int().positive(),
  }),
  claude: z.object({
    command: z.string().min(1),
    outputFormat: z.literal("json"),
    timeoutMs: z.number().int().positive(),
  }),
  paths: z.object({
    projectRoot: z.string().min(1),
    dataDir: z.string().min(1),
    cacheDir: z.string().min(1),
    logDir: z.string().min(1),
    dbPath: z.string().min(1),
    workspaceRoot: z.string().min(1),
  }),
  limits: z.object({
    maxImageSizeMb: z.number().positive(),
    maxFileSizeMb: z.number().positive(),
    maxReplyChars: z.number().int().positive(),
  }),
  wechat: z.object({
    adapterMode: z.enum(["local-dev", "wx-clawbot"]),
    pollIntervalMs: z.number().int().positive(),
    devInboxDir: z.string().min(1),
    devOutboxDir: z.string().min(1),
    devProcessedDir: z.string().min(1),
    sessionFile: z.string().min(1),
    receiptMessage: z.string().min(1),
    minReceiptVisibleMs: z.number().int().nonnegative(),
  }),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
