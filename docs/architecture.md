# Architecture

## Core flow

```text
Adapter -> Router -> Cache / Session / Preprocess -> Claude Runner -> Reply Formatter -> Adapter
```

## Modules

1. `adapter/`: adapter interface, local development adapter, and real `wx-clawbot` adapter.
2. `bridge/`: routing, prompt building, reply formatting, and application orchestration.
3. `runner/`: Claude Code CLI execution through a child process.
4. `services/`: config, cache, preprocessing, session storage, and logging.
5. `types/`: shared message, artifact, and config types.

## Why the local adapter exists

The local adapter makes the repository runnable without scanning a real WeChat QR code. The `wx-clawbot` adapter is the current real-connection path for personal WeChat integration.
