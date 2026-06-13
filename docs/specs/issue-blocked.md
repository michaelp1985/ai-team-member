# Issue Blocked

## Event

`issues.labeled` — fired when a label is applied to an issue. This spec activates only when the applied label name is `blocked`. No other label triggers this behavior.

## Goal

When an issue is marked blocked, the agent posts a structured intake form as a comment prompting the team to capture the information needed to facilitate unblocking. The form collects:

- **Reason blocked** — what is preventing progress
- **Dependencies** — external work, decisions, or resources required to unblock
- **Stakeholders** — people or teams who need to be involved or notified
- **Contacted** — whether the relevant stakeholders have been reached out to

The agent does not attempt to resolve the blockage. Its job is to ensure the right information is captured and that stakeholder contact is acknowledged before the issue sits idle.

## Trigger

Label name: `blocked` (exact match, case-insensitive). The `blocked` label must be pre-created on the target repo. If a different label convention is used (e.g. `status: blocked`), the label name should be stored in an environment variable rather than hardcoded.

## Intake Form

When triggered, the agent posts a comment containing a structured form. The form uses a markdown checklist and freetext fields so it is human-readable and editable directly in the GitHub UI.

Proposed structure:

```
## Blocked — Intake Form

**Reason blocked:**
<!-- What is preventing progress on this issue? -->


**Dependencies:**
<!-- List any external work, decisions, approvals, or resources required to unblock. -->


**Stakeholders:**
<!-- List anyone who needs to be involved or notified (GitHub @mentions preferred). -->


**Stakeholder contact:**
- [ ] Stakeholders have been contacted
```

The `contacted` checkbox serves as the tracked boolean. The agent reads this field when re-evaluating the issue.

## Re-evaluation

The agent should re-evaluate the blocked issue when:

1. `issues.edited` is fired and the issue was previously labeled `blocked` — the author may have updated context
2. `issue_comment.created` is fired on a blocked issue — a team member may have filled in or updated the form

On re-evaluation, the agent checks whether:
- All form fields have been filled in
- The `contacted` checkbox is checked

If the form is complete and `contacted` is checked, the agent posts a follow-up comment summarizing the captured information and confirming it is on record. If the form is still incomplete, the agent does not re-post the form — it replies once noting what is still missing.

## Open Questions

### 1. How should the agent detect that the form has been filled?

The form is posted as a comment. When a team member fills it in, they edit that comment — but GitHub does not fire a webhook for comment edits on issue comments (only for issue body edits). The agent would need to re-read the comment via `get_issue_comments` on a re-evaluation trigger instead.

Alternatively, require team members to post a new comment (not edit the agent's comment) with the filled-in data. This is less clean UX but more reliable to detect.

### 2. Where is the `contacted` boolean persisted?

Options:
- **GitHub comment checkbox** — the checkbox in the agent's posted form is the source of truth; agent reads it on re-evaluation via `get_issue_comments`
- **DynamoDB** — agent stores `{ contacted: boolean }` in conversation history for the issue; updated whenever the agent re-reads the form
- **GitHub Project custom field** — a `Contacted` boolean field on the Project item; queryable via GraphQL

GitHub comment checkbox is the simplest for POC — no additional storage needed. DynamoDB is appropriate if the value needs to drive downstream logic without re-reading GitHub on every event.

### 3. Should the agent identify stakeholders from the issue body, or wait for a human to fill them in?

The agent could scan the issue body for `@mentions` and pre-populate the stakeholders field. This would reduce friction for well-written issues. Risk: the agent may identify incidental mentions rather than true stakeholders.

Safer default: leave the stakeholders field blank and let the team fill it in. The agent can note in the form comment if it found any `@mentions` in the issue body as a prompt.

### 4. What if the `blocked` label is removed before the form is completed?

If `issues.unlabeled` fires with label `blocked`, the agent should post a comment noting the issue has been unblocked and that the intake form (if filled) is on record. No further action required.

### 5. Should there be a follow-up if the form is not filled within a set period?

A time-based follow-up would require a scheduled mechanism (EventBridge cron or similar) — out of scope for the current architecture. Deferred unless a scheduling capability is added.

## Notes

- The `issues.labeled` event payload includes `label.name` — use this to filter for `blocked` without reading the full label list
- The agent must not re-post the intake form on every re-evaluation trigger — only on the initial `issues.labeled` event
- If an issue is labeled `blocked` multiple times (removed and re-applied), the agent should post a new form each time
- GitHub `@mentions` in the stakeholders field will trigger GitHub notifications to those users automatically, which may be sufficient to satisfy the "contacted" requirement in some workflows
