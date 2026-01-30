# Decision Protocol

## What is a Decision?

A decision is any new or changed “shared truth” that affects future work, including:
- Architecture
- Semantics
- Roles or responsibilities
- UI meaning or behavior
- Naming or structure
- Installation / distribution / tooling workflows
- Trade-offs and “we chose X over Y”

## Triage (Must / Ask / Skip)

### Must record (no confirmation needed)

Write a decision **before replying** when you do any of the following:

- Provide an evaluation / analysis / recommendation that could steer future work
- Propose an improvement plan or a set of next steps
- Introduce or change any rule/constraint/process
- Choose a default (e.g. install method, folder structure, version pinning policy)
- Decide between alternatives (trade-off)

### Ask first (medium importance)

If you’re unsure whether the recommendation should become shared truth, ask:

> “Should I record a decision for X?”

Examples:
- Optional refactors or style preferences
- Suggestions that depend on missing info (URL, constraints, team preference)
- Reversible tweaks that may not be adopted

### Skip (not worth a decision)

Do **not** write a decision for:

- One-off clarifications or Q&A that doesn’t change future behavior
- Trivial edits (formatting, typos) with no semantic impact
- Ephemeral runtime details (logs, transient errors) unless they affect policy

## Where Decisions Live

- **Never** write decisions to global `~/.context/` (global = law).
- Always write decisions to the project-local log:
  - `<project>/.context/DECISIONS/`
  - For this repo, that is: `.context/DECISIONS/`

## Rules

- Decisions are append-only.
- Do not rewrite history.
- AI agents are allowed to write decisions.

## Minimum Content

- Context: why this matters now
- Decision: what is now considered true
- Implications: what must follow from this
