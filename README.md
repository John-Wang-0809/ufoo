# ufoo

## Project Instructions Files

`AGENTS.md` is the canonical project instructions file. `CLAUDE.md` should contain a single line: `AGENTS.md` to avoid drift.

A global workspace manager for AI-assisted coding.

Goal: provide a single, best-practice entrypoint to install/update optional modules globally (under `~/.ufoo/`) and initialize per-project collaboration context (under `<project>/.context/`).

## Modules

- `context`: multi-agent decision + context synchronization (project `.context/`)
- `resources`: optional UI/ICONS references (non-core)

## Intended global layout

```
~/.ufoo/
  bin/
  modules/
    context/
    resources/
  config.yml
  lock.yml
```

## Next

This repo will provide:
- `ufoo install|update|doctor|init|skills`
- a project initializer that creates `.context/` and injects `CLAUDE.md`/`AGENTS.md` blocks.

## CLI (local dev)

- Bash CLI (works without Node): `./bin/ufoo --help`
- Node/npm CLI (for global `ufoo`): `npm link` (uses `bin/ufoo.js`; has a dependency-free fallback parser)
