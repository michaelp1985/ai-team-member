# C4 — Component

## Components

```mermaid
flowchart TD
    subgraph Foundation["FoundationStack"]
        DDB[("DynamoDB\nai-team-member-state\npk + sk, on-demand, PITR")]
        PAT["SSM SecureString\n/ai-team-member/github/pat"]
        WebhookSecret["SSM SecureString\n/ai-team-member/github/webhook-secret"]
        Role["IAM Role\nShared Lambda execution role\n(DynamoDB, SSM, Bedrock)"]
    end

    Application["ApplicationStack\n(see application project C4 docs)"]

    Application -->|"imports table name,\nparam paths, role ARN"| Foundation
```

## Component Responsibilities

### `FoundationStack`

| Resource | Details |
|---|---|
| DynamoDB table | Partition key: `pk` (string), sort key: `sk` (string). On-demand billing. Point-in-time recovery enabled. |
| SSM `/ai-team-member/github/pat` | SecureString — GitHub Personal Access Token |
| SSM `/ai-team-member/github/webhook-secret` | SecureString — HMAC signing secret for webhook validation |
| Lambda execution role | Shared role for all application Lambdas; permits DynamoDB read/write, SSM GetParameter, Bedrock InvokeAgent |

### `ApplicationStack`
Thin orchestration layer — instantiates constructs defined in the application project and wires `FoundationStack` outputs into them via props. Internal construct detail is covered in the application project's C4 docs.
