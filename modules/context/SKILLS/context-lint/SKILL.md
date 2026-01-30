---
name: context-lint
description: |
  Validate ufoo context protocol and project-local context structure.
  Use when: (1) Checking protocol integrity, (2) A repo is missing context files, (3) Someone proposes deleting "unused" context.
  This skill treats canonical context as enforceable via file inspection.
---

# Context Lint / Validator

## Workflow

1. **Ask what to validate**:
   - Protocol repo (this repository)
   - Project-local `.ufoo/context/` directory

2. **Run lint**:
   - Protocol: `ufoo ctx lint`
   - Project: `ufoo ctx lint --project <path>`

3. **If lint fails**:
   - Report missing items as the source of truth
   - Propose minimal patches
   - If removal/renaming is intended, require an explicit decision first

## Notes

- This repo is `context` (protocol module). UI/ICONS belong in `resources` and are not linted here.
