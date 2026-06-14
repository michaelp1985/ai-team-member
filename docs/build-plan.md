# Application Build Plan

## Architecture Decision: Converse API + Async Lambda

Switched from managed Bedrock Agents (Action Groups) to the **Bedrock Converse API** with a DIY tool loop. The orchestrator Lambda runs the full reasoning loop in-process: send event + tool definitions → receive tool call → execute tool → return result → repeat until done. Domain tools (MCP-style) call GitHub via the shared client layer.

SQS queues and invoker Lambdas dropped in favour of **async Lambda invocation** — the webhook receiver invokes the orchestrator with `InvocationType: Event` and immediately returns 200. A single failure DLQ captures orchestrator events that exhaust Lambda's built-in async retry (2 attempts), configured via Lambda event destination.

---

## Phase 1 — CDK Application Stack

Build the CDK constructs and wire them into the application stack. No Lambda source code yet — constructs reference handler paths that will exist after Phase 2.

### Steps

- [x] Scaffold `application/lib/application-stack.ts` — separate CDK app in `application/`; cross-stack dependency via CloudFormation exports (`Fn.importValue`)
- [x] `application/lib/constructs/log-groups.ts` — CloudWatch log groups for each Lambda, 7-day retention, `DESTROY` removal policy
- [x] ~~`application/lib/constructs/agent-queues.ts`~~ — **removed**; replaced by async Lambda invocation + single failure DLQ (see below)
- [x] `application/lib/constructs/github-client-layer.ts` — Lambda Layer construct referencing `src/github-client/dist`
- [x] `application/lib/constructs/webhook-lambda.ts` — ARM Node.js Lambda, imported role via `Fn.importValue`, environment vars for orchestrator Lambda ARN and SSM param name
- [x] `application/lib/constructs/api-gateway.ts` — HTTP API, `POST /webhook` route, 10 req/s throttle on `$default` stage; GitHub IP allowlist deferred (requires WAF — HMAC validation is current control)
- [x] ~~`application/lib/constructs/bedrock-agents.ts`~~ — **removed**; no managed Bedrock Agent resources needed for Converse API
- [x] `infra/lib/foundation-stack.ts` — CfnOutput exports for table name, table ARN, lambda role ARN
- [x] Add GitHub Actions workflow for application stack deploy
- [x] `application/lib/constructs/orchestrator-lambda.ts` — ARM Node.js Lambda; GitHub client layer attached; env vars for DynamoDB table, SSM param names, Bedrock model ID; 15-min timeout
- [x] `application/lib/constructs/failure-dlq.ts` — single SQS standard queue; wired as orchestrator Lambda async invocation `onFailure` event destination
- [x] Update `webhook-lambda.ts` — swap queue URL env vars for orchestrator Lambda ARN; grant `lambda:InvokeFunction` on orchestrator to webhook role
- [x] Update `log-groups.ts` — drop the three invoker log groups; add orchestrator log group
- [x] Update `infra/lib/foundation-stack.ts` — `bedrock:InvokeAgent` replaced with `bedrock:InvokeModel`

---

## Phase 2 — Webhook Receiver Lambda

The entry point. Must be complete before any end-to-end flow works.

### Steps

- [x] Scaffold `src/webhook-receiver/` — TypeScript Lambda project
- [x] HMAC-SHA256 signature verification against SSM-sourced webhook secret
- [x] Payload normalization — `normalize.ts`; `WebhookEvent` type; maps `issues`, `pull_request`, `pull_request_review`, `pull_request_review_comment` to internal schema
- [x] Async orchestrator invoke — `InvokeCommand` with `InvocationType: 'Event'`; unsupported event types return 200 and skip invoke
- [ ] Unit tests (BDD)

---

## Phase 3 — GitHub Client Layer

Shared by the orchestrator Lambda. Build before Phase 4.

### Steps

- [x] Scaffold `src/github-client/` — Lambda Layer source
- [x] Octokit wrapper with SSM-sourced PAT auth
- [x] Rate limit backoff
- [x] Pagination helpers

---

## Phase 4 — Orchestrator Lambda

Single Lambda that runs the Bedrock Converse API loop. Receives a normalized `WebhookEvent`, reasons about it using domain tools, and acts on GitHub.

### Steps

- [x] Scaffold `src/orchestrator/` — TypeScript Lambda project
- [x] Add orchestrator Lambda CDK construct (Phase 1 step above)
- [x] Bedrock Converse API loop — send messages + tool definitions; handle `toolUse` blocks; send tool results; repeat until `endTurn`
- [x] Domain tool definitions — typed tool schemas exposed to Converse API:
  - Story/issue tools: `get_issue`, `create_issue`, `update_issue`
  - PR tools: `get_pull_request`, `list_commits`, `get_diff`
  - Review tools: `get_pr_comments`, `post_comment`, `request_changes`, `approve_pr`
- [x] Tool handlers — implement each tool using the GitHub client layer
- [x] DynamoDB conversation history load/save — keyed by repo + issue/PR number

---

## Phase 5 — System Prompts

Guide the orchestrator's reasoning per event type.

### Steps

- [x] System prompt per event type (`issues.opened`, `pull_request.opened`, `pull_request.synchronize`, `pull_request_review.submitted`, `pull_request_review_comment.created`) — fallback prompt for all other actions
- [x] Prompt instructs which tools are relevant and what the expected output action is
- [x] Prompts bundled with the Lambda in `src/orchestrator/prompts.ts` — SSM deferred; not needed for POC

---

## Post-MVP Enhancements

Possible expansions after the core system is working end-to-end.

- **Label support** — Pre-create a standard label set on target repos and instruct the agent via system prompt to apply them during triage. `create_issue` and `update_issue` already accept a `labels` array; GitHub silently drops names that don't exist on the repo, so labels must be pre-created before the agent can use them.

---

## Phase 6 — GitHub Webhook Registration

Wire GitHub to the deployed API Gateway endpoint.

### Steps

- [x] Register webhook on target repo(s) — `POST /webhook`, content type `application/json`
- [x] Set webhook secret to match SSM value
- [x] Select events: **Pull requests**, **Pull request reviews**, **Pull request review comments**
- [x] Verify delivery in GitHub webhook logs
- [x] Enable **Issues** event on webhook

---

## Phase 7 — GitHub App Authentication

Replace the Personal Access Token with a GitHub App so agent comments post as `app-name[bot]` rather than the owner's personal account.

### Steps

- [x] Register a GitHub App — name, homepage URL, permissions (Issues: Read & Write, Pull requests: Read & Write), webhooks disabled
- [x] Install the app on target repo(s)
- [x] Generate and download the private key (`.pem`)
- [x] Store App ID and private key PEM in SSM SecureString parameters
- [x] Swap `@octokit/rest` auth in `github-client` for `@octokit/auth-app` — JWT → installation access token flow
- [x] Update `orchestrator-lambda.ts` env vars and SSM param references for App ID and private key params
- [x] Remove PAT SSM parameter from `infra/foundation-stack.ts`

---

## Phase 8 — Issue Comment Threading

Allow the agent to receive and normalize `issue_comment` events. GitHub fires `issue_comment` as a separate event type from `issues` — it is not currently registered or handled. Directed response logic and system prompt are in Phase 10.

### Steps

- [x] Enable **Issue comments** event on the GitHub webhook
- [x] Add `issue_comment` to `SUPPORTED_EVENTS` in `normalize.ts` and `WebhookEventType`
- [x] Add `issue_comment` normalizer case in `normalizePayload` — payload shape: `issue.number`, `comment.body`, `repository`

---

## Phase 9 — Observability

Add structured, traceable logging across all components. A correlation ID threads from API Gateway through the webhook-receiver and into the orchestrator so every log line for a single GitHub event can be grouped in CloudWatch. No log viewer or external tooling required — all output is structured JSON to stdout, which Lambda routes to CloudWatch Logs automatically.

### Steps

- [ ] Add `correlationId: string` to `WebhookEvent` in `normalize.ts` — populated from API Gateway `requestContext.requestId` in the webhook-receiver handler before normalization
- [ ] Add `logger.ts` to `src/webhook-receiver/` — emits structured JSON `{ level, component, correlationId, event, timestamp, ...extras }` to stdout
- [ ] Add `logger.ts` to `src/orchestrator/` — same schema as webhook-receiver logger; component value is `"orchestrator"`
- [ ] Instrument `src/webhook-receiver/index.ts`:
  - `request.received` — correlationId, eventType header, repo
  - `signature.verified` — pass/fail (no secret value)
  - `event.normalized` — eventType, action, itemNumber
  - `orchestrator.invoked` — correlationId forwarded
- [ ] Instrument `src/orchestrator/index.ts`:
  - `event.received` — correlationId, eventType, action, repo, itemNumber
  - `history.loaded` — messageCount
  - `history.saved` — messageCount
- [ ] Instrument `src/orchestrator/loop.ts`:
  - `bedrock.invoke` — iteration index, modelId (no prompt or message content)
  - `bedrock.response` — stopReason, inputTokens, outputTokens
  - `tool.dispatch` — toolName (no input payload)
  - `tool.result` — toolName, success or error message
  - `loop.end` — totalIterations, finalStopReason

---

## Phase 10 — Issue Comment Directed Response

Extend Phase 8 threading to filter for comments directed at the bot and respond to them as a Q&A interaction rather than a triage. Depends on Phase 8.

### Steps

- [x] Add `senderIsBot: boolean` to `WebhookEvent` — computed in `normalizePayload` from `sender.type === 'Bot' || sender.login.endsWith('[bot]')`; set to `false` for all non-`issue_comment` event types
- [x] Add `BOT_MENTION_SLUG` environment variable to `orchestrator-lambda.ts` CDK construct — value: `@sdlc-agent-petty`
- [x] Add guards in `src/orchestrator/index.ts` before invoking the Converse loop:
  - If `event.senderIsBot` → return early (prevents self-reply loop)
  - If `event.eventType === 'issue_comment'` and comment body does not contain `BOT_MENTION_SLUG` → return early
- [x] Add `issue_comment.created` system prompt in `prompts.ts`:
  - Agent is answering a specific directed question — not triaging
  - Instructs use of `get_issue` for issue context and prior conversation history already loaded
  - Instructs use of `post_comment` to reply
  - Explicitly prohibits re-triaging, re-labeling, or repeating prior analysis

---

## Phase 11 — Issue Completeness Check

When a new issue is opened, evaluate whether it contains enough information to be acted on before proceeding to triage. Implemented entirely as a system prompt update — no new tools or code logic required.

### Steps

- [ ] Rewrite `issuesOpened` system prompt in `prompts.ts`:
  1. Use `get_issue` to read the issue title and body
  2. Evaluate completeness: does the issue have a **meaningful description** (more than a title or one-liner)? Does it have **acceptance criteria or deliverables**?
  3. Post a comment via `post_comment` with:
     - Brief findings (what was found or missing)
     - Verdict: **"✅ Ready for work"** or **"⚠️ Needs review"**
     - If "needs review": bulleted list of exactly what is missing
  4. If verdict is "needs review" → call no further tools; stop
  5. If verdict is "ready for work" → acknowledge the issue and describe the expected follow-up

---

## Phase 12 — GitHub Projects v2 Support

React to project board changes (e.g. item status updated from Backlog → In Progress).

> **Before starting:** enable the **Projects v2** event in GitHub webhook settings.

### Steps

- [ ] Add `projects_v2_item` to supported event types in `normalize.ts` — payload shape differs from issues/PRs; item references a project item ID, not a standard issue number
- [ ] Write normalizer for `projects_v2_item` payload
- [ ] Add GitHub client functions for reading and updating project item fields (status, iteration, etc.) using the GraphQL API — Projects v2 is not available via Octokit REST
- [ ] Add tool definitions and handlers for project operations
- [ ] Write system prompt for `projects_v2_item.edited` (status change event)
