# ucode Native Core (WIP)

`src/code/` is the self-developed core area for `ucode`.

## Reference Repo (pi-mono)

- Local reference repo path: `/Users/icy/Code/pi-mono`
- Upstream reference URL: `https://github.com/badlogic/pi-mono`
- Primary reference package: `https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent`

Note:
- `pi-mono` is reference-only for architecture and behavior alignment.
- `ucode` NL core and TUI/runtime orchestration are implemented in `src/code/`.

## Current native scope (phase 1)

- Tool kernel:
  - `read`
  - `write`
  - `edit`
  - `bash`
- Interactive agent loop:
  - `ucode> ...` free-form task input routes to model-backed planner path
  - `tool/run` commands stay available as deterministic fallback
- Dispatcher: `runToolCall({ tool, args }, { workspaceRoot })`
- Queue runtime:
  - `ucode-core submit`
  - `ucode-core run-once`
  - `ucode-core list`
