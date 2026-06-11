# C4 — Container

## Containers

```mermaid
flowchart TD
    GitHub["GitHub"]
    Bedrock["AWS Bedrock\n(Converse API)"]
    DDB[("DynamoDB\n(FoundationStack)")]

    APIGW["API Gateway\n(HTTP API — public)"]
    Receiver["Webhook Receiver\n(Lambda)"]
    Orchestrator["Orchestrator\n(Lambda)"]
    FailDLQ["Failure DLQ\n(SQS)"]
    GHClient["GitHub Client\n(Lambda Layer — shared)"]

    GitHub -->|"POST /webhook"| APIGW
    APIGW --> Receiver
    Receiver -->|"async InvokeFunction"| Orchestrator
    Orchestrator <-->|"Converse API\n(reasoning loop)"| Bedrock
    Orchestrator -->|"tool calls"| GHClient
    GHClient -->|"REST API"| GitHub
    Orchestrator -->|"read/write state"| DDB
    Orchestrator -->|"on failure"| FailDLQ
```

## Container Descriptions

| Container | Technology | Responsibility |
|---|---|---|
| API Gateway | HTTP API | Public entry point. Enforces rate limiting (10 req/s, 50 burst). |
| Webhook Receiver | Lambda — ARM/Node.js | Validates HMAC signature, normalizes payload to internal `WebhookEvent` schema, async-invokes the Orchestrator Lambda and immediately returns 200. |
| Orchestrator | Lambda — ARM/Node.js (15-min timeout) | Drives the Bedrock Converse API reasoning loop. Loads conversation history from DynamoDB, sends the event + domain tool definitions to the model, executes tool calls via the GitHub Client layer, and persists updated history. |
| GitHub Client | Lambda Layer — Node.js | Shared Octokit wrapper used by the Orchestrator's tool handlers. Handles PAT auth (SSM-sourced), rate limit backoff, and pagination. |
| Failure DLQ | SQS standard queue | Receives the event payload when the Orchestrator Lambda exhausts Lambda's built-in async retry (2 attempts). Configured as the Orchestrator's `onFailure` event destination. |

## Decisions

**EventBridge** was considered for initial event routing but dropped in favour of direct writes to avoid fan-out complexity. See [ADR 001](../adr/001-drop-eventbridge-direct-sqs.md).

**SQS queues + managed Bedrock Agents** were the original design but replaced by async Lambda invocation and the Bedrock Converse API. Three domain queues and three invoker Lambdas collapsed into one Orchestrator Lambda. Domain tools (MCP-style abstraction over GitHub) are defined inside the Orchestrator and called in-process by the tool loop, avoiding the Action Group / OpenAPI indirection that managed Bedrock Agents require.
