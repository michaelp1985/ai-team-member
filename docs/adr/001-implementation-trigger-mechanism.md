# ADR 001 — Implementation Trigger Mechanism: Comment Directive

**Status:** Accepted

## Context

When the AI team member gains the ability to check out code, implement a feature, and submit a pull request, something must tell it when to start. Four mechanisms were evaluated for triggering the implementation workflow from a GitHub issue.

## Options Considered

**Option A — Assign issue to a dedicated GitHub user account**
Create a `sdlc-agent-petty` GitHub user and add it as a collaborator. Assigning an issue to that user fires `issues.assigned`. Native GitHub UX; the assignment is visible on the issue card and project board. Requires maintaining a second GitHub account.

**Option B — Apply a label**
Apply a label such as `agent: implement` to signal the issue is ready for the agent. Fires `issues.labeled`. No extra accounts required. Loses the visual "assigned to" indicator.

**Option C — GitHub Projects v2 status change**
Move the issue to a dedicated board column or status (e.g. "Agent Queue"). Fires `projects_v2_item.edited`. Most workflow-native for a kanban-driven team. Requires Projects v2 support (Phase 12) and GraphQL tooling not yet built.

**Option D — Comment directive**
A team member posts `@sdlc-agent-petty implement` on the issue. The existing `issue_comment.created` handler (Phase 10) already filters for bot mentions and routes to the orchestrator. Zero additional infrastructure required.

## Decision

Use **Option D — comment directive** for the initial implementation.

## Tradeoffs

| | A — User assignment | B — Label | C — Project status | D — Comment directive |
|---|---|---|---|---|
| GitHub-native UX | Yes — assignee field | Partial — label visible | Yes — board column | No — conversational |
| Infrastructure required | Second GitHub account | None | Phase 12 + GraphQL | None (Phase 10 already built) |
| Visible on project board | Yes | With label display | Yes | No |
| Trigger precision | High — single action | High — single action | High — status field | Medium — depends on comment phrasing |
| Supports future automation | Yes | Yes | Yes | Limited |
| Implementation effort | Low | Low | High | Zero |

## Rationale

At POC stage the priority is validating the implementation loop end-to-end, not the trigger UX. Option D requires zero new infrastructure — the comment routing built in Phase 10 already handles mention detection and bot-guard filtering. The team can trigger implementation with a single comment and iterate on the trigger mechanism once the core workflow is proven.

Option A is the preferred long-term UX and should be revisited once a dedicated agent GitHub account is warranted. Option C becomes natural once Phase 12 (Projects v2) is in place and a kanban workflow is established.

## Consequences

- Trigger phrasing must be documented so team members know to use `@sdlc-agent-petty implement`
- No visual indicator on the issue or board that implementation has been requested — the agent's reply comment serves as acknowledgment
- Migrating to Option A or C later requires adding a new event handler but no removal of existing infrastructure
