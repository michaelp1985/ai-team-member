# Implementation Workflow

Triggered when a collaborator posts `@sdlc-agent-petty implement` on a GitHub issue. The agent checks out the target repository, implements the feature described in the issue, and submits a pull request.

See [ADR 001](../adr/001-implementation-trigger-mechanism.md) for trigger mechanism rationale.

---

## Sequence Diagram

```mermaid
sequenceDiagram
    actor Developer
    participant GitHub
    participant APIGW as API Gateway
    participant WebhookRx as Webhook Receiver
    participant Orchestrator
    participant SSM as SSM Parameter Store
    participant CodeBuild
    participant Bedrock as Amazon Bedrock<br/>(Nova Pro)
    participant EventBridge
    participant Notifier as Completion Notifier

    Developer->>GitHub: Posts "@sdlc-agent-petty implement" on issue
    GitHub->>APIGW: POST /webhook (issue_comment.created)
    APIGW->>WebhookRx: Forward request
    WebhookRx->>WebhookRx: Verify HMAC-SHA256 signature
    WebhookRx->>WebhookRx: Normalize → WebhookEvent
    WebhookRx--)Orchestrator: InvokeFunction (Event) — async
    WebhookRx-->>APIGW: 200 OK
    APIGW-->>GitHub: 200 OK

    Orchestrator->>Orchestrator: Detect "implement" keyword in comment body
    Orchestrator->>SSM: GetParameter /ai-team-member/codebuild/timeout-minutes
    SSM-->>Orchestrator: "30"
    Orchestrator->>CodeBuild: StartBuild<br/>env: ISSUE_NUMBER, REPO_OWNER, REPO_NAME, REPO_FULL_NAME<br/>timeoutInMinutesOverride: 30
    CodeBuild-->>Orchestrator: Build ID
    Orchestrator->>GitHub: Post acknowledgment comment on issue

    Note over CodeBuild: pre_build

    CodeBuild->>SSM: GetParameter /ai-team-member/github/app-id
    CodeBuild->>SSM: GetParameter /ai-team-member/github/private-key (SecureString)
    SSM-->>CodeBuild: App ID + private key PEM
    CodeBuild->>CodeBuild: node get-install-token.js → GitHub installation token
    CodeBuild->>GitHub: git clone https://x-access-token:<token>@github.com/<owner>/<repo>.git repo/
    CodeBuild->>CodeBuild: git checkout -b feature/issue-N-implementation
    CodeBuild->>CodeBuild: cd agent && npm ci

    Note over CodeBuild: build — agent tool loop

    loop Up to 30 iterations
        CodeBuild->>Bedrock: ConverseCommand<br/>(system prompt, tool definitions, message history)
        alt stopReason = toolUse
            Bedrock-->>CodeBuild: Tool call (get_issue / read_file / write_file / list_directory / run_shell / post_comment)
            CodeBuild->>CodeBuild: Execute tool
            CodeBuild->>Bedrock: ConverseCommand (tool result appended to history)
        else stopReason = end_turn
            Bedrock-->>CodeBuild: Final message
            CodeBuild->>CodeBuild: Agent finished — exit loop
        end
    end

    Note over CodeBuild: post_build

    CodeBuild->>CodeBuild: git add -A
    CodeBuild->>CodeBuild: git diff --cached --quiet?

    alt Changes were made
        CodeBuild->>CodeBuild: node get-install-token.js → fresh token
        CodeBuild->>CodeBuild: git commit -m "implement issue #N"
        CodeBuild->>GitHub: git push origin feature/issue-N-implementation
        CodeBuild->>GitHub: Create pull request (create-pr.js)
        GitHub-->>CodeBuild: PR URL
    else No changes
        CodeBuild->>CodeBuild: Skip commit/push/PR
    end

    CodeBuild--)EventBridge: Build state change (SUCCEEDED or FAILED)
    EventBridge--)Notifier: Invoke (build metadata)
    Notifier->>GitHub: Post PR link (success) or failure summary on issue
```

---

## Data Flow Diagram

Shows the data passed between components at each stage of the workflow.

```mermaid
flowchart TD
    Developer([Developer])
    GitHub([GitHub])

    subgraph AWSRegion [AWS]
        APIGW["API Gateway\nHTTP API — POST /webhook"]
        WebhookRx["Webhook Receiver λ\nHMAC verify · normalize"]
        Orchestrator["Orchestrator λ\nintent detection · CodeBuild trigger"]
        DynamoDB[("DynamoDB\nconversation history")]
        SSM[("SSM Parameter Store\n/github/app-id\n/github/private-key\n/codebuild/timeout-minutes")]

        subgraph CodeBuildEnv [CodeBuild — ARM1 build environment]
            PreBuild["pre_build\nfetch credentials\ngit clone + branch"]
            AgentLoop["build\nimplement.js tool loop"]
            PostBuild["post_build\ngit commit · push · create-pr.js"]
            AgentScripts["agent/scripts/\n(loaded from ai-team-member primary source)"]
        end

        Bedrock["Amazon Bedrock\nNova Pro — Converse API"]
        EventBridge["EventBridge\nbuild state rule"]
        Notifier["Completion Notifier λ"]
    end

    Developer -- "issue_comment: @sdlc-agent-petty implement" --> GitHub
    GitHub -- "POST /webhook\nX-Hub-Signature-256 header" --> APIGW
    APIGW -- "raw payload + headers" --> WebhookRx
    WebhookRx -- "WebhookEvent\n{ eventType, repo, itemNumber, payload }" --> Orchestrator
    Orchestrator -- "GetParameter\ntimeout-minutes" --> SSM
    Orchestrator -- "StartBuild\nISSUE_NUMBER · REPO_OWNER\nREPO_NAME · REPO_FULL_NAME\ntimeoutInMinutesOverride" --> PreBuild
    Orchestrator -- "acknowledgment comment" --> GitHub
    Orchestrator <-- "load/save history" --> DynamoDB

    PreBuild -- "GetParameter\napp-id · private-key" --> SSM
    PreBuild -- "git clone + push auth\nx-access-token" --> GitHub
    AgentScripts -. "node scripts/*.js" .-> PreBuild
    AgentScripts -. "node scripts/*.js" .-> AgentLoop
    AgentScripts -. "node scripts/*.js" .-> PostBuild

    AgentLoop -- "ConverseCommand\nsystem prompt · tools · message history" --> Bedrock
    Bedrock -- "tool call or end_turn" --> AgentLoop
    AgentLoop -- "read/write files\nrun shell commands" --> AgentLoop
    AgentLoop -- "get_issue · post_comment" --> GitHub

    PostBuild -- "git push\nfeature branch" --> GitHub
    PostBuild -- "create PR\nPR metadata" --> GitHub

    CodeBuildEnv -- "SUCCEEDED / FAILED\nbuild ID · env vars" --> EventBridge
    EventBridge -- "build event" --> Notifier
    Notifier -- "PR URL or failure summary\ncomment on issue" --> GitHub
```

---

## Key Data Contracts

### WebhookEvent (Orchestrator input)

| Field | Type | Example |
|---|---|---|
| `eventType` | string | `issue_comment` |
| `repo.owner` | string | `michaelp1985` |
| `repo.name` | string | `my-project` |
| `repo.fullName` | string | `michaelp1985/my-project` |
| `itemNumber` | number | `42` |
| `senderIsBot` | boolean | `false` |
| `payload.comment.body` | string | `@sdlc-agent-petty implement` |

### CodeBuild Environment Variables

| Variable | Source | Purpose |
|---|---|---|
| `ISSUE_NUMBER` | StartBuild override | Target issue |
| `REPO_OWNER` | StartBuild override | Repository owner |
| `REPO_NAME` | StartBuild override | Repository name |
| `REPO_FULL_NAME` | StartBuild override | `owner/repo` — used for git clone URL |
| `GITHUB_APP_ID` | SSM (pre_build) | GitHub App authentication |
| `GITHUB_PRIVATE_KEY` | SSM (pre_build, SecureString) | GitHub App JWT signing |
| `GITHUB_TOKEN` | Derived (get-install-token.js) | Git HTTPS auth, Octokit calls |
| `BEDROCK_MODEL_ID` | Project env var | `us.amazon.nova-pro-v1:0` |
| `AGENT_SPEC_PATH` | Project env var | Path to `AGENT.md` in target repo |

### Feature Branch Convention

```
feature/issue-<ISSUE_NUMBER>-implementation
```

Pull request targets `main`. Branch is pushed to the **target repository**, not `ai-team-member`.

---

## Error Paths

| Failure point | Behaviour |
|---|---|
| HMAC verification fails | Webhook receiver returns 403; orchestrator never invoked |
| Orchestrator Lambda fails (×2 retries) | Event routed to SQS failure DLQ |
| CodeBuild: agent posts `post_comment` with blockers | Build exits cleanly; no PR created; comment visible on issue |
| CodeBuild: no file changes after tool loop | `git diff --cached --quiet` returns 0; post_build skips commit/push/PR |
| CodeBuild: build FAILED state | EventBridge triggers notifier; failure summary posted on issue |
| MAX_ITERATIONS (30) reached without `end_turn` | `implement.js` throws; CodeBuild marks build FAILED |
