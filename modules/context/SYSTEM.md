# AI System Contract

This repository defines the canonical collaboration context
for all AI agents working on a codebase.

## Purpose

Solve one core problem with AI coding agents:

1. **Memory sync across agents** — Multiple AI tools (Claude Code, Codex, Cursor, etc.) have no shared memory. Decisions made in one session are lost to others. This protocol makes decisions persist as files, enabling true multi-agent collaboration.

## Rules

- Files in this repository are authoritative.
- Constraints are hard requirements, not suggestions.
- Silent architectural or semantic decisions are forbidden.
- If conflict or ambiguity exists, stop and ask.
- Shared truth must be written, not remembered.
