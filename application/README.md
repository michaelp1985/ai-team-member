# ai-team-member — Application

CDK application stack and Lambda source for the AI Team Member system. Receives GitHub webhook events, normalizes them, and invokes an AI orchestrator that reasons over the event and acts on GitHub using the Bedrock Converse API.

## Directory Structure

```
application/
  bin/                        CDK app entry point
  lib/
    application-stack.ts      Root stack — wires all constructs together
    constructs/
      api-gateway.ts          HTTP API Gateway — POST /webhook, 10 req/s throttle
      webhook-lambda.ts       Webhook receiver Lambda — HMAC validation, normalization, async invoke
      orchestrator-lambda.ts  Orchestrator Lambda — Bedrock Converse API loop
      github-client-layer.ts  Lambda Layer construct — shared Octokit wrapper
      failure-dlq.ts          SQS queue — captures orchestrator failures after retries
      log-groups.ts           CloudWatch log groups, 7-day retention
  src/
    webhook-receiver/         Lambda source — validates and normalizes GitHub webhook payloads
    github-client/            Lambda Layer source — Octokit wrapper with SSM auth, rate limiting, pagination
    orchestrator/             Lambda source — Bedrock Converse API loop and domain tools (Phase 4)
  docs/
    build-plan.md             Phased implementation plan
    c4/                       C4 architecture diagrams
    adr/                      Architecture decision records
```

## How It Works

1. GitHub sends a webhook `POST /webhook` to API Gateway
2. The **webhook receiver** Lambda verifies the HMAC-SHA256 signature, normalizes the payload into a `WebhookEvent`, and invokes the orchestrator asynchronously (`InvocationType: Event`)
3. The **orchestrator** Lambda receives the `WebhookEvent`, loads conversation history from DynamoDB, and runs a Bedrock Converse API loop — sending tool definitions, receiving tool calls, executing them via the GitHub client, and returning results until the model reaches `endTurn`
4. If the orchestrator exhausts Lambda's async retry attempts (2), the event is routed to the **failure DLQ** for inspection

## Infrastructure Dependencies

This stack depends on exports from the **foundation stack** (`infra/`):

| Export | Used by |
|---|---|
| `ai-team-member-lambda-role-arn` | Both Lambdas — shared IAM execution role |
| `ai-team-member-table-name` | Orchestrator — DynamoDB conversation history |

## Supported GitHub Events

| Event | Actions |
|---|---|
| `issues` | all actions |
| `pull_request` | all actions |
| `pull_request_review` | all actions |
| `pull_request_review_comment` | all actions |

## Development

### Prerequisites

- Node.js 22
- AWS CDK v2
- AWS credentials for account `REDACTED`, region `us-east-2`

### Build Lambda Sources

```bash
# Webhook receiver
cd src/webhook-receiver && npm install && npm run build

# GitHub client layer
cd src/github-client && npm install && npm run build

# Orchestrator (Phase 4)
cd src/orchestrator && npm install && npm run build
```

### Deploy

```bash
npm install
npm run build
npx cdk deploy
```

### Useful CDK Commands

```bash
npx cdk diff     # compare deployed stack with current state
npx cdk synth    # emit synthesized CloudFormation template
```
