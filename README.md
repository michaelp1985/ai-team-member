# ai-team-member

A serverless AI agent that participates in the software development lifecycle as a GitHub bot. It receives GitHub webhook events, reasons about them using AWS Bedrock, and takes action — triaging issues, reviewing pull requests, answering questions, and implementing features end-to-end.

---

## What it does

**Today**
- Triages new issues — checks for completeness (description, acceptance criteria) and posts a "ready for work" or "needs review" verdict
- Reviews pull requests — summarizes changes, flags concerns, requests changes when warranted
- Answers questions — responds when mentioned directly (`@sdlc-agent-petty`) in an issue comment; uses full issue history for context
- Participates in PR review threads — adds technical context to review comments
- Implements features — triggered by `@sdlc-agent-petty implement` in an issue comment; checks out the repo, runs a Bedrock agent loop, and opens a pull request for human review

**In progress**
- GitHub Projects v2 integration — reacts to board status changes; auto-assigns work via a custom "Agent Mode" project field

---

## Architecture

```
GitHub Webhooks
      │
      ▼
API Gateway (HTTP API)
      │
      ▼
Lambda — Webhook Receiver
  validates HMAC signature, normalizes event, invokes orchestrator async
      │
      ▼
Lambda — Orchestrator
  Bedrock Converse API tool loop (Amazon Nova Pro)
  loads/saves conversation history (DynamoDB)
  detects @sdlc-agent-petty implement directive
      │
      ├─── GitHub API (issues, PRs, comments)
      │
      └─── CodeBuild — Implementation Agent
             clones target repo, runs Bedrock agent loop,
             pushes feature branch, opens pull request
                   │
                   └─── on failure → EventBridge → Lambda — Notifier
                                      posts failure comment with build log URL
```

Fully serverless and pay-per-use. No VPC, no idle compute. Failed orchestrator invocations go to an SQS dead-letter queue after two retries.

---

## Implementation Agent

The implementation agent runs in AWS CodeBuild (ARM, Node.js 22) and is triggered by commenting `@sdlc-agent-petty implement` on any GitHub issue.

**Workflow:**
1. Reads the issue — if acceptance criteria are missing, posts a comment and stops
2. Explores the repository structure and existing conventions
3. Implements the feature, writes tests, verifies they pass
4. Creates an ADR or updates C4 docs if the change is architectural
5. Commits, pushes a feature branch, and opens a pull request

### Project configuration

Each repository can include an `AGENT.md` file at its root to provide project-specific conventions — coding standards, test frameworks, architecture patterns, documentation requirements. The agent reads this file at startup and treats it as authoritative over its defaults.

```
# AGENT.md — example entries
## Testing Standards
Use Vitest, not Jest. Feature files live in test/features/.

## Architecture Patterns
All new Lambda handlers must use the existing execution role in FoundationStack.
```

If no `AGENT.md` is present the agent falls back to its built-in defaults. The spec file path is configurable via the `AGENT_SPEC_PATH` environment variable on the CodeBuild project.

The `AGENT.md` at the root of this repo configures the agent for work on `ai-team-member` itself.

---

## Stack

| Layer | Technology |
|---|---|
| Cloud | AWS (Lambda, API Gateway, DynamoDB, SQS, CodeBuild, EventBridge, Bedrock, SSM, CDK) |
| Runtime | Node.js 22.x, TypeScript, ARM (Graviton2) |
| LLM | Amazon Nova Pro via Bedrock Converse API |
| GitHub integration | GitHub App, Octokit, HMAC-SHA256 webhook verification |
| IaC | AWS CDK (TypeScript), two stacks: foundation + application |

---

## Docs

- [`docs/build-plan.md`](docs/build-plan.md) — phased implementation plan and progress
- [`docs/adr/`](docs/adr/) — architecture decision records
- [`application/docs/c4/`](application/docs/c4/) — C4 architecture diagrams (application stack)
- [`AGENT.md`](AGENT.md) — project configuration for the AI implementation agent
