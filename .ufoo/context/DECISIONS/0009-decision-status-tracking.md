---
status: resolved
resolved_by: claude-code
resolved_at: 2026-01-28
---
# DECISION 0009: Decision Status Tracking via Frontmatter

Date: 2026-01-28
Author: Human / AI

## Context

Multiple AI agents (Claude Code, Codex) may read decisions repeatedly. Need a way to mark decisions as "processed" so they don't need to be re-read.

Evaluated options:
- A. File rename (0003-RESOLVED-xxx.md) - requires rename
- B. Frontmatter status field - atomic, in-file
- C. Timestamp filtering - imprecise
- D. Separate .processed directory - extra management

## Decision

**Use frontmatter status field (Option B)**

Format:
```yaml
---
status: open | resolved | wontfix
resolved_by: <agent>      # optional
resolved_at: <date>       # optional
---
```

Script behavior:
- Default filter: `-s open` (only show open decisions)
- Use `-s all` to see everything
- Use `-s resolved` to see processed decisions

## Rationale

1. Status lives with content - no sync issues
2. Git diff shows who changed status
3. Simple grep filtering: `grep -l "status: open"`
4. Backward compatible - files without frontmatter default to "open"

## Implications

- All existing decisions get `status: open` frontmatter
- `ctx` skill only shows open decisions by default
- Agents should mark decisions as `resolved` after processing
- Reduced context noise for subsequent sessions
