# ai-team-member

A serverless AI agent that participates in the software development lifecycle as a GitHub bot. It receives GitHub webhook events, reasons about them using AWS Bedrock, and takes action — triaging issues, reviewing pull requests, answering questions, and eventually implementing features end-to-end.

---

## What it does

**Today**
- Triages new issues — checks for completeness (description, acceptance criteria) and posts a "ready for work" or "needs review" verdict
- Reviews pull requests — summarizes changes, flags concerns, requests changes when warranted
- Answers questions — responds when mentioned directly (`@sdlc-agent-petty`) in an issue comment; uses full issue history for context
- Participates in PR review threads — adds technical context to review comments

**In progress**
- Implementation agent — checks out code, creates a feature branch, implements a GitHub issue, and submits a pull request for human review
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
      │
      ▼
Lambda Layer — GitHub Client
  GitHub App auth (JWT → installation token)
  Octokit REST API
      │
      ▼
GitHub API
```

Fully serverless and pay-per-use. No VPC, no idle compute. Failed orchestrator invocations go to an SQS dead-letter queue after two retries.

---

## Stack

| Layer | Technology |
|---|---|
| Cloud | AWS (Lambda, API Gateway, DynamoDB, SQS, Bedrock, SSM, CDK) |
| Runtime | Node.js 22.x, TypeScript, ARM (Graviton2) |
| LLM | Amazon Nova Pro via Bedrock Converse API |
| GitHub integration | GitHub App, Octokit, HMAC-SHA256 webhook verification |
| IaC | AWS CDK (TypeScript), two stacks: foundation + application |

---

## Docs

- [`docs/overview.md`](docs/overview.md) — detailed architecture and data flows
- [`docs/build-plan.md`](docs/build-plan.md) — phased implementation plan and progress
- [`docs/adr/`](docs/adr/) — architecture decision records
- [`docs/specs/`](docs/specs/) — feature specs and open questions
- [`application/docs/c4/`](application/docs/c4/) — C4 architecture diagrams
