# Orchestrator Failure Notification

## Event

The orchestrator Lambda exhausts Lambda's built-in async retry (2 attempts) and the failed invocation record lands on the **failure DLQ** (SQS).

This is already wired: `orchestrator-lambda.ts` configures `retryAttempts: 2` with `onFailure: new destinations.SqsDestination(failureDlq)`. No infrastructure change is needed to detect the failure — the DLQ is the signal.

## Goal

Notify one or more team members when an orchestrator failure occurs so it can be investigated and replayed or discarded manually.

The notification should include enough context to identify the failure: which repo, which issue/PR number, and ideally the error or a link to the CloudWatch log stream.

## Open Questions

### 1. Notification channel

Options to evaluate:

| Option | Notes |
|---|---|
| CloudWatch Alarm → SNS → email | Simplest. Alarm on `NumberOfMessagesSent` for the DLQ; SNS email subscription. No Lambda needed. Delay up to 1 min (alarm evaluation period). |
| SQS trigger → Lambda → custom logic | Most flexible. A small Lambda reads the DLQ message, extracts context, and sends a notification via any channel (SES, Slack webhook, etc.). More moving parts. |
| EventBridge Pipes (DLQ → target) | Newer pattern. Pipes can route DLQ messages directly to an SNS topic, Lambda, or API destination without a consumer Lambda. Worth evaluating for simplicity. |
| AWS Chatbot → Slack / Teams | Connects CloudWatch Alarms or SNS to a Slack/Teams channel via AWS Chatbot. Requires a Slack workspace or Teams tenant. |

### 2. Notification recipient(s)

- Single owner email for POC, or
- Slack channel (if Chatbot route is chosen)

### 3. Message content

Minimum useful payload from the DLQ message:
- Timestamp
- Repo full name
- Issue / PR number
- Error message or exception type (from Lambda destination payload)
- CloudWatch log stream link

## Constraints

- POC — keep it simple; avoid adding significant ongoing cost
- No existing Slack workspace configured in AWS
- SES sending is available but requires sandbox verification for new addresses
