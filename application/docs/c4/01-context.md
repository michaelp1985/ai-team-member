# C4 — Context

## System Context

```mermaid
flowchart TD
    GitHub["GitHub\n(Projects, Issues, PRs)"]
    App["ai-team-member / application\n───────────────\nReceives GitHub events, reasons\nabout them via the Bedrock Converse API,\nand acts back through the GitHub API."]
    Bedrock["AWS Bedrock\n(Converse API — Claude Haiku / Sonnet)"]
    Foundation["ai-team-member / infra\nFoundationStack\n(DynamoDB, SSM, IAM)"]

    GitHub -->|"webhook events"| App
    App -->|"GitHub API calls\n(issues, PRs, comments)"| GitHub
    App -->|"InvokeModel\n(Converse API)"| Bedrock
    App -->|"reads state + secrets"| Foundation
```

## Actors and Systems

| Actor / System | Description |
|---|---|
| GitHub | Source of webhook events (issues, PRs, project board). Target of API calls for story creation, PR submission, and comment posting. |
| AWS Bedrock | Provides the Converse API. The application drives the reasoning loop directly — sending events, receiving tool call requests, executing tools, and returning results until the model reaches a conclusion. |
| FoundationStack | Provides DynamoDB (conversation state), SSM parameters (GitHub PAT, webhook secret), and shared IAM execution role. Owned by the infra project. |
