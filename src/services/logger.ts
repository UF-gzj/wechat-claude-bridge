import pino from "pino";

export function createLogger() {
  return pino({
    level: process.env.NODE_ENV === "development" ? "debug" : "info",
  });
}
