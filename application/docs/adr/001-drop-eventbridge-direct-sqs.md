# ADR 001 — Event Routing: Direct SQS over EventBridge

**Status:** Accepted

## Context

The webhook receiver Lambda needs to route normalized GitHub events to the correct agent domain (Story, PR, Review). Two approaches were considered: publishing to an EventBridge custom bus with routing rules, or writing directly to the target SQS queue based on event type.

## Decision

Route directly from the webhook receiver Lambda to SQS. No EventBridge custom bus.

## Tradeoffs

| | EventBridge | Direct SQS |
|---|---|---|
| Event archive / replay | Yes — built-in archive, replayable against new consumers | No — events not persisted beyond queue retention |
| Routing logic location | EventBridge rules (infra) | Lambda code (switch on event type) |
| Adding a new agent | Add a rule, no Lambda change | Update Lambda routing code |
| Producer failure handling | GitHub webhook retry | GitHub webhook retry (same) |
| Consumer failure handling | DLQ on target queue | DLQ on target queue (same) |
| Operational complexity | Higher — additional service, rules to manage | Lower — one fewer service |
| Cost at < 100 events/month | Negligible ($0.00) | Negligible ($0.00) |

## Rationale

At the expected volume (< 20 invocations/week), the operational simplicity of direct SQS outweighs the flexibility of EventBridge. The routing logic is a simple switch on event type — not complex enough to justify a dedicated routing layer.

**Producer-side failures** (receiver Lambda fails to send to SQS) are covered by GitHub's own webhook retry mechanism. GitHub retries failed deliveries up to ~4 times over several hours when the endpoint returns a non-2xx. No data is lost as long as the endpoint eventually responds successfully.

**Consumer-side failures** (agent invoker Lambda fails to process a message) are covered by a DLQ on each SQS queue with `maxReceiveCount: 3`. Failed messages are held in the DLQ for inspection and manual reprocessing.

The two scenarios where EventBridge would become worth adding:
1. Event archive/replay is needed — e.g., replaying historical events against a newly deployed agent
2. Multiple independent consumers need to receive the same event simultaneously (fan-out)

Neither applies at POC stage.

## Consequences

- No event archive or replay capability
- Adding a new agent type requires a Lambda code change in addition to a new SQS queue
- GitHub retry behavior is the safety net for producer failures — endpoint must return 2xx reliably or events may be lost after retries are exhausted
