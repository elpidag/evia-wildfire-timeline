# Codex Workflow

## Purpose
Keep Codex efficient and grounded while building this module.

## General rule
Do not ask Codex to build the whole module in one thread.

Use one thread per phase.

## Mandatory opening pattern
Start every thread with:

```text
Read AGENTS.md first.
Then read only the files relevant to this task.
Before coding, summarize:
- files read
- constraints extracted
- smallest safe implementation step
- deliverables
Do not code until you have written that summary.
```

## Mandatory closing pattern
End every implementation prompt with:

```text
After coding, report:
- files changed
- commands run
- tests run
- assumptions
- known gaps
- next recommended step
```

## Re-grounding pattern
When the thread gets long or drifts:

```text
Pause coding.
Re-read AGENTS.md and the task-relevant docs.
Summarize:
- current goal
- current phase
- files already changed
- unresolved issues
- next smallest safe step
Do not continue coding until you have written that summary.
```

## File-reading discipline
Codex should not read every file on every turn.

### Minimum file sets by phase

#### Ingestion phase
- `AGENTS.md`
- `README.md`
- `DATA_AUDIT.md`
- `DATA_INGESTION_SPEC.md`
- `IMPLEMENTATION_PLAN.md`

#### Timeline phase
- `AGENTS.md`
- `README.md`
- `VISUALIZATION_SPEC.md`
- `IMPLEMENTATION_PLAN.md`
- generated JSON outputs
- any existing shared helpers

#### Supporting charts phase
- `AGENTS.md`
- `VISUALIZATION_SPEC.md`
- generated JSON outputs
- shared helpers

#### Integration phase
- `AGENTS.md`
- `README.md`
- `VISUALIZATION_SPEC.md`
- `IMPLEMENTATION_PLAN.md`
- the built chart components

## Context-efficiency rules
- prefer asking for one safe phase at a time
- avoid repeating the entire project history in prompts
- rely on repo docs rather than chat history
- ask Codex to restate constraints before editing
- ask Codex to report assumptions explicitly

## Suggested command discipline
Ask Codex to use project-native commands and show what it ran.

Typical expectations:
- install only needed packages
- prefer official Astro setup commands
- run build and typecheck after major steps
- avoid dependency churn
