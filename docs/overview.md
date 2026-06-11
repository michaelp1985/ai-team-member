# ai-team-member

A serverless system that connects GitHub to AWS Bedrock to automate software development lifecycle tasks. The system acts as an AI team member — receiving GitHub webhook events, reasoning about them using a Bedrock LLM, and acting on GitHub via a shared API client.

---

## Goals

- Automate routine GitHub tasks: issue triage, labeling, PR review participation
- Participate in PR review cycles via comments posted as a bot identity
- Keep costs minimal on a personal AWS account (serverless, pay-per-use throughout)

---

## High-Level Architecture

```
GitHub
  │
  │  Webhooks (issues, PRs, PR reviews, PR review comments)
  ▼
API Gateway (HTTP API)
  │
  ▼
Lambda — Webhook Receiver
  │  validates HMAC signature, normalizes event, invokes orchestrator async
  │
  │  InvocationType: Event
  ▼
Lambda — Orchestrator
  │  Bedrock Converse API tool loop
  │  loads/saves conversation history (DynamoDB)
  │  calls domain tools until endTurn
  │
  ▼
github-client (Lambda Layer)
  │  GitHub App JWT → installation token auth
  ▼
GitHub API
```

Failure path: orchestrator Lambda retries 2× (Lambda async invoke built-in); exhausted retries go to a single SQS failure DLQ.

---

## Components

### webhook-receiver
Receives inbound GitHub webhooks. Verifies the HMAC-SHA256 signature against the secret stored in SSM, normalizes the payload into a standard internal `WebhookEvent` schema, and invokes the orchestrator Lambda asynchronously (`InvocationType: Event`). Returns 200 immediately — no waiting for the orchestrator to finish.

**Supported GitHub event types** (`application/src/webhook-receiver/normalize.ts`):

| Event type | Actions handled |
|---|---|
| `issues` | `opened`, `edited`, and others |
| `pull_request` | `opened`, `synchronize`, and others |
| `pull_request_review` | `submitted` |
| `pull_request_review_comment` | `created` |

Unsupported event types are dropped after signature verification — the receiver returns 200 without invoking the orchestrator.

- **AWS:** API Gateway (HTTP API), Lambda (Node.js/TypeScript, ARM)

### orchestrator
Single Lambda that drives the full reasoning loop. Receives a normalized `WebhookEvent`, builds a system prompt for the event type, and runs the Bedrock Converse API tool loop: send messages + tool definitions → receive tool call → execute tool → return result → repeat until `endTurn`. Loads prior conversation history from DynamoDB at the start and saves the updated history when done.

- **AWS:** Lambda (Node.js/TypeScript, ARM, 15-min timeout), Bedrock Converse API
- **Model:** Amazon Nova Pro (`us.amazon.nova-pro-v1:0`) — cross-region inference profile

### github-client
Shared Lambda Layer wrapping the GitHub REST API (Octokit). Handles GitHub App authentication (JWT → installation access token via `@octokit/auth-app`), rate limit backoff, and pagination. Used by the orchestrator tool handlers. Comments post as `app-name[bot]` rather than a personal account.

- **Runtime:** Node.js/TypeScript Lambda Layer
- **Auth:** GitHub App — App ID and private key PEM stored as SSM SecureString parameters

### infrastructure
Two CDK stacks separated at the stateful/stateless boundary.

**Foundation stack** (deploy once, rarely changed)
- DynamoDB table — conversation history keyed by `repo#<fullName>` / `item#<number>`
- SSM SecureString parameters — webhook secret, GitHub App ID, GitHub App private key PEM
- Shared IAM roles and policies (Bedrock `InvokeModel`, SSM `GetParameter`, DynamoDB read/write)

**Application stack** (deploy frequently)
- API Gateway (HTTP API) — `POST /webhook` route, 10 req/s throttle on `$default` stage
- Lambda — webhook receiver, orchestrator
- Lambda Layer — github-client
- SQS — single failure DLQ for exhausted orchestrator retries
- CloudWatch log groups (7-day retention)

- **AWS:** CDK (TypeScript), DynamoDB on-demand, SSM Parameter Store

---

## Data Flow: Issue Opened

1. A new issue is created in the target GitHub repo
2. GitHub fires `issues.opened` webhook to API Gateway
3. Webhook receiver validates HMAC, normalizes to `WebhookEvent`, invokes orchestrator async, returns 200
4. Orchestrator loads conversation history (empty for new issue), builds `issues.opened` system prompt
5. Bedrock (Nova Pro) reasons and calls `get_issue` tool → github-client fetches issue detail
6. Model produces a triage comment; orchestrator calls `post_comment` tool → github-client posts via GitHub App
7. Conversation history saved to DynamoDB

## Data Flow: PR Review Comment

1. Someone comments on an open PR
2. GitHub fires `pull_request_review_comment.created`
3. Webhook receiver normalizes and invokes orchestrator async
4. Orchestrator loads prior conversation history for this PR from DynamoDB
5. Model reads comment context; may call `get_diff`, `get_pr_comments`, or `get_pull_request` tools
6. Model decides to reply or request changes; orchestrator calls `post_comment` or `request_changes` tool
7. Comment posted to GitHub as `app-name[bot]`; history saved to DynamoDB

---

## API Gateway Security

| Control | Approach |
|---|---|
| Rate limiting | Stage-level throttling: 10 req/s rate, 50 burst |
| Payload validation | HMAC-SHA256 signature verified in webhook receiver before any downstream processing |

WAF and GitHub IP allowlist deferred — HMAC validation is sufficient for POC.

---

## Networking

No VPC for POC. Lambda outside a VPC is appropriate for a serverless-only architecture — Lambda has no public endpoint, and IAM is the access control boundary. A proper VPC (private subnets + NAT) can be added to the foundation stack if this graduates beyond POC.

---

## CI/CD

GitHub Actions deploys both stacks via the existing `github-actions-career-deploy` IAM role using OIDC (no long-lived credentials). Role is scoped to `michaelp1985/Career` repo, `main` branch. Deployment workflow triggers on push to `main` for changes under `ai-team-member/application/**`.

---

## Cost Controls

| Decision | Reason |
|---|---|
| HTTP API Gateway over REST | ~70% cheaper per million calls |
| Lambda on ARM (Graviton2) | ~20% cheaper per GB-second |
| Amazon Nova Pro over Anthropic Sonnet | No use-case form required; competitive cost |
| Single orchestrator Lambda over managed Bedrock Agents | No per-agent overhead; simpler; tool loop is straightforward to DIY |
| Async Lambda invocation over SQS fan-out | Eliminates SQS queues and invoker Lambdas; single failure DLQ via Lambda event destination |
| DynamoDB on-demand billing | No provisioned capacity sitting idle |
| SSM Parameter Store over Secrets Manager | Same KMS encryption, saves $0.40/secret/month |
| CloudWatch log retention = 7 days | Avoids accumulating storage costs |
| No VPC / NAT Gateway | Would add ~$32/month minimum — not justified for serverless POC |
