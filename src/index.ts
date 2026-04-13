import path from "node:path";
import { fileURLToPath } from "node:url";

import { BridgeApplication } from "./bridge/app.js";
import { loadConfig } from "./services/config-loader.js";
import { createLogger } from "./services/logger.js";

async function main(): Promise<void> {
  const currentFile = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(currentFile), "..");
  const config = await loadConfig(projectRoot);
  const logger = createLogger();
  const app = new BridgeApplication(config, logger);

  await app.start();

  const stop = async () => {
    await app.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
