---
status: resolved
resolved_by: claude-code
resolved_at: 2026-01-28
---
# DECISION 0003: GitHub Distribution & Protocol Installation

Date: 2026-01-27
Author: Human / AI

## Context

We discussed whether:

- publishing this repository to GitHub, and
- having the init skill reference GitHub

would solve the protocol installation problem.

## Decision

1. **GitHub can solve protocol distribution**, but only for the protocol repository content itself.
2. **Skills remain tool-specific artifacts** (Codex/Claude/etc.) and still need an installation step into each tool’s skill directory; “skill references GitHub” does not automatically install the skill.
3. The preferred protocol installation/update mechanism is:
   - `~/.ai-context/protocol` is a Git working copy of the protocol repo
   - install via `git clone`, update via `git pull --ff-only`
   - optionally pin to a tag/commit for reproducibility
4. Protocol bootstrap instructions must **avoid user-machine absolute paths** (e.g. `/Users/...`) and instead use:
   - a repo URL (for GitHub), and/or
   - an overridable env var (for private mirrors/offline copies)

## Implications

- Add/adjust documentation and init skill steps to support `git clone/pull` based setup.
- Keep an offline/manual fallback (copy from a local path) for restricted environments.
- When changing the “official install method”, record a decision and keep lint/docs consistent.

