# Issue Completeness Check

## Event

`issues.opened` — the agent's initial response to a new issue is already implemented. This spec extends that behavior: before doing any triage work, the agent evaluates whether the issue contains enough information to act on. If not, it posts a comment asking for the missing details and waits.

## Goal

Prevent the agent from triaging or acting on incomplete issues. When a new issue lacks required information, the agent should:

1. Post a comment identifying what is missing and asking for it
2. Take no further triage action until the issue is updated

## Suggested Required Data Points

Issues tend to fall into one of three types, each with different required fields. The agent should first classify the issue type, then validate against the appropriate checklist.

### Bug Report

| Field | Why it matters |
|---|---|
| Description of the problem | What is broken |
| Steps to reproduce | Allows verification and investigation |
| Expected behavior | Establishes what "correct" looks like |
| Actual behavior | Establishes what is currently happening |
| Environment (version, OS, config) | Scopes the blast radius |

### Feature Request

| Field | Why it matters |
|---|---|
| Problem statement | Why is this needed; what pain does it solve |
| Desired behavior or outcome | What the feature should do |
| Acceptance criteria | When is this considered done |

### Task / Chore

| Field | Why it matters |
|---|---|
| Description of the work | What needs to be done |
| Definition of done | How to know it is complete |

A short title with no body should always trigger a request for more information regardless of type.

## Open Questions

### 1. How should the agent determine issue type?

Options:

- **LLM inference** — agent reads the title and body and classifies the type itself. No structure required from the author. Risk: misclassification on ambiguous issues.
- **Label** — author applies a label (`bug`, `feature`, `task`) at creation time; agent reads `labels` from the issue payload. Simple and deterministic, but requires labels to be pre-created on the repo and authors to apply them.
- **GitHub issue templates** — GitHub supports per-repo issue templates (markdown or YAML form) that prompt the author to fill in structured fields and can auto-apply a label. If templates are in place, the agent can check for expected section headers in the body. This enforces structure before the issue reaches the agent.

A hybrid approach is reasonable: use GitHub issue templates to guide authors, and fall back to LLM inference for issues created without a template.

### 2. What is the threshold for "enough" information?

- Empty or near-empty body is a clear fail
- A one-sentence body with no reproduction steps for a bug is ambiguous
- Should the agent use a strict checklist, or make a judgment call based on overall clarity?

LLM judgment is likely the right tool here — a checklist would require the agent to parse free-form text for specific field names, which is fragile. The system prompt should instruct the agent to evaluate completeness holistically and list what it finds missing rather than applying rigid rules.

### 3. How does the agent know to re-evaluate after the author updates the issue?

The `issues.edited` action is included in the `issues` webhook event. The agent could re-run the completeness check when an issue it previously flagged as incomplete is edited. This requires the agent to remember that it asked for more information — the existing DynamoDB conversation history can serve this purpose.

### 4. Should the agent refuse to triage until the issue is complete, or triage with caveats?

- **Hard stop** — post the clarification request and do nothing else until updated. Cleaner, but the author gets no value until they respond.
- **Best-effort triage** — triage what it can and note the gaps. Risk: incomplete triage may be more confusing than none.

Hard stop is the safer default for a POC.

## Notes

- GitHub issue templates are repo-level config (`.github/ISSUE_TEMPLATE/`) and would live in the target repo (`air-poc`), not in `ai-team-member`. Worth setting up alongside this feature.
- The clarification comment should be friendly and specific — list the exact fields missing rather than a generic "please provide more detail."
- The agent should not re-ask for the same information on every `issues.edited` event if the author has already provided it.
