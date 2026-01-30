# Context Structure

## Global (read-only)

```
~/.ufoo/
└── modules/
    └── context/     # installed context module
```

- **Read-only**
- Template source for init
- No decisions, no assumptions
- Law, not truth

## Project-local (writable)

```
<project>/
└── .context/
    ├── README.md
    ├── SYSTEM.md
    ├── CONSTRAINTS.md
    ├── ASSUMPTIONS.md
    ├── TERMINOLOGY.md
    └── DECISIONS/
```

- **In the repo** — can diff, can review
- This is where truth lives
- Must be versionable

## Required files (project)

| File | Purpose |
|------|---------|
| README.md | Entry point; how to use this context |
| SYSTEM.md | Project architecture and purpose |
| CONSTRAINTS.md | Non-negotiable rules |
| ASSUMPTIONS.md | Current assumptions (update when changed) |
| TERMINOLOGY.md | Shared vocabulary |
| DECISIONS/ | Append-only decision log |

## Red line

**Never write decisions or assumptions to global.**

Global = law.
Project = truth.
