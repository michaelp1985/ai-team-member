# Issue Comment — Directed Response

## Event

`issue_comment.created` — fired whenever anyone (human or bot) posts a comment on an issue.

> **Dependency:** requires Phase 8 (Issue Comment Threading) to be implemented first — `issue_comment` must be a registered webhook event and handled in `normalize.ts`.

## Goal

The agent should reply to comments on an issue **only when the comment is directed at it**. It must not respond to every comment on every issue — only the ones intended for it.

It must also never respond to its own comments to prevent an infinite reply loop.

## Filtering Rules (always apply)

Regardless of which triggering mechanism is chosen, two filters must always be enforced in the normalizer or orchestrator:

1. **Ignore bot comments** — skip any `issue_comment.created` event where `sender.type === 'Bot'`. This prevents the agent from replying to itself.
2. **Ignore non-directed comments** — apply the chosen triggering mechanism below to determine whether the comment is addressed to the agent.

## Open Questions

### 1. Triggering mechanism — how does a user direct a comment at the agent?

Two options to evaluate:

**Option A — GitHub @mention**

Users address the bot with `@michaelp1985-ai-team-member` in the comment body (GitHub Apps get a mentionable slug based on the app name). The filter checks whether `comment.body` contains `@michaelp1985-ai-team-member` (or the configured app slug).

- Pros: standard GitHub UX; users are already familiar with @mentions; no custom convention to document
- Cons: users must know the exact app slug; slug is tied to the app name and would change if the app is renamed

**Option B — Prefix convention**

Comments directed at the agent must start with a defined prefix, e.g. `bot:` or `@agent`.

- Pros: simple string check; prefix is configurable without touching GitHub app settings
- Cons: not a GitHub-native pattern; requires users to learn and follow a convention

### 2. Should the agent respond to @mentions anywhere in the comment, or only when the mention starts the message?

Relevant if Option A is chosen — a mention buried mid-comment may be incidental rather than a direct request.

### 3. What context should the agent include in its response?

When replying to a directed comment, the agent has access to:
- The full issue body and metadata (via `get_issue`)
- Prior conversation history from DynamoDB (loaded by the orchestrator)
- The specific comment text that triggered it

The system prompt for `issue_comment.created` should instruct the agent it is answering a specific question, not re-triaging the issue.

## Notes

- The `issue_comment` event payload includes `sender.login` and `sender.type` — both fields are available for filtering
- GitHub App bot login follows the pattern `<app-slug>[bot]` — this is distinct from `sender.type === 'Bot'` but both can be checked
- If the @mention route is chosen, the app slug (`michaelp1985-ai-team-member`) should be stored as a Lambda environment variable rather than hardcoded so it can change without a code deploy
