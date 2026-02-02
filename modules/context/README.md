# context

A collaboration protocol that constrains AI behavior through explicit, versioned files.

## Why

AI coding agents (Claude Code, Codex, Cursor, etc.) have two fundamental problems:

1. **No shared memory** — Decisions made in one session are invisible to other agents or future sessions. Each agent starts fresh, repeating mistakes or contradicting prior work.

This protocol solves it by treating decisions and context as files:
- **Decisions as files** — Persistent, versioned, reviewable. All agents read the same truth.

## Core Principle

```
Global context defines the law.
Project context defines the truth.
```

**Files are truth, not memory.**

## Quick Start

```bash
# Install `ufoo` globally (once), then use it to install modules and init projects.
```

This repository is the `context` module. The recommended entrypoint is `ufoo`.

## Architecture

### Global: `~/.ufoo/` (read-only for agents, managed by humans)

Global modules live under `~/.ufoo/modules/`.

### Project: `<project>/.context/` (writable)

```
.context/
├── README.md        # Entry point / how to use this context
├── SYSTEM.md        # Project architecture
├── CONSTRAINTS.md   # Non-negotiable rules
├── ASSUMPTIONS.md   # Current assumptions
├── TERMINOLOGY.md   # Shared vocabulary
└── DECISIONS/       # Append-only log
```

Must be in Git. Must be reviewable. Truth.

## Protocol Structure

```
context/                 # This repo
├── SYSTEM.md               # Protocol definition
├── RULES.md                # Collaboration rules
├── CONSTRAINTS.md          # Protocol constraints
├── DECISION-PROTOCOL.md    # How to write decisions
├── HANDOFF.md              # Session handoff rules
├── CONTEXT-STRUCTURE.md    # Project structure spec
├── TEMPLATES/              # AI behavior constraint
├── SKILLS/                 # tool skill docs (module-local)
└── .context/            # Local project context for this repo (ignored; not part of protocol distribution)
```

## For AI Agents

1. Read installed module from `~/.ufoo/modules/context/`
2. Read/write context from `<project>/.context/`
3. **Never write to global** — only to project
4. When unsure, write a decision
5. Do not modify TEMPLATES/ without a decision

## Validate

```bash
# protocol repo
ufoo ctx lint

# project-local context (in a real project repo)
ufoo ctx lint --project <path-to-project-context>
```
