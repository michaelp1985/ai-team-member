# Agent Configuration — ai-team-member

This file is read by the AI implementation agent at the start of every build. It defines project-specific conventions that take precedence over agent defaults.

---

## Repository Structure

```
ai-team-member/
  agent/               # CodeBuild implementation agent scripts
  application/         # ApplicationStack — Lambda, API Gateway, CodeBuild, CDK
    lib/
      constructs/      # One CDK construct per AWS resource group
    src/
      github-client/   # Lambda Layer — shared Octokit wrapper
      orchestrator/    # Orchestrator Lambda source
      webhook-receiver/# Webhook Receiver Lambda source
      implementation-notifier/ # Implementation Notifier Lambda source
    docs/c4/           # C4 diagrams for the application project
  infra/               # FoundationStack — DynamoDB, SSM, IAM
    docs/c4/           # C4 diagrams for the infra project
  docs/
    adr/               # Architecture decision records
    build-plan.md      # Phased implementation plan
  buildspec.yml        # CodeBuild build specification
```

---

## Two-Stack Architecture

This project uses two CDK stacks that must remain independent:

- **FoundationStack** (`infra/`) — DynamoDB table, SSM parameters, shared IAM execution role. Deploy first. Never import `application/` constructs here.
- **ApplicationStack** (`application/`) — all Lambda, API Gateway, CodeBuild, SQS, and EventBridge resources. Consumes FoundationStack outputs via props. Never import `infra/` constructs directly — use `cdk.Fn.importValue` or pass outputs as strings.

---

## CDK Patterns

- One construct file per logical resource group in `application/lib/constructs/`
- Construct props interfaces are defined in the same file as the construct
- All AWS resource names follow the pattern `ai-team-member-<resource>` (e.g., `ai-team-member-orchestrator`, `ai-team-member-implementation`)
- Log groups are centrally managed in `log-groups.ts` with 7-day retention and `DESTROY` removal policy
- Use `cdk.Stack.of(this).region` and `cdk.Stack.of(this).account` — never hardcode region or account ID
- `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` are set in the CI pipeline

## Lambda Conventions

- Runtime: Node.js 22.x, ARM64 (Graviton2) — `lambda.Architecture.ARM_64`
- All Lambda source lives in `application/src/<name>/`
- Each Lambda has its own `package.json`, `tsconfig.json`, and compiles independently via `tsc`
- The GitHub Client layer (`application/src/github-client/`) is shared across Lambdas via a Lambda Layer — never bundle Octokit directly into a Lambda handler
- Environment variables are injected by CDK constructs — never hardcode values in Lambda source
- SSM parameter names are passed as env vars (e.g., `GITHUB_APP_ID_PARAM`), not the values themselves

## GitHub App Auth Pattern

Authentication always goes through the GitHub Client layer:

```typescript
import * as github from 'github-client';
// github.getIssue(), github.createIssueComment(), etc.
```

The layer handles JWT generation, installation token exchange via SSM, rate limit backoff, and pagination. Lambda handlers and agent scripts must not implement their own auth flow.

> Exception: `agent/scripts/get-install-token.js` and `agent/scripts/implement.js` run in CodeBuild (outside Lambda) and use `@octokit/auth-app` directly since the layer is not available there.

---

## TypeScript Conventions

- Strict mode in all `tsconfig.json` files — `"strict": true`
- ESM modules — `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`
- `.js` extensions on all local imports (required for ESM)
- `type` imports where possible — `import type { Foo } from './foo.js'`
- Cast to `any` only when handling raw external payloads (e.g., GitHub webhook body)
- No comments unless the WHY is non-obvious

---

## Testing Standards

- BDD preferred: Gherkin feature files (`.feature`) with Jest + Cucumber step definitions
- Feature files live alongside the source they test
- All existing tests must pass before a PR is submitted
- Run tests with `npm test` from the relevant `src/<name>/` directory

---

## Documentation Standards

### ADRs

Create an ADR in `docs/adr/` for any decision that:
- Changes the runtime architecture (new AWS service, new invocation pattern)
- Introduces a new external dependency
- Chooses between two or more meaningfully different approaches

File naming: `NNN-short-title.md` (e.g., `002-use-dynamodb-for-history.md`). Number sequentially from the highest existing ADR.

Format: Title, Status, Context, Options Considered, Decision, Tradeoffs (table), Rationale, Consequences.

### C4 Diagrams

Three files per project: `docs/c4/01-context.md`, `02-container.md`, `03-component.md`.

**Black box principle**: each project documents only its own internals. `application/` and `infra/` are siblings — neither shows the other's internal components.

Update C4 docs when you add, remove, or rename a container or component. If an ADR drives an architectural change, reference it from the relevant C4 file.

---

## Deployment

- FoundationStack deploys via `.github/workflows/deploy-infra.yml` on push to `main` under `infra/**`
- ApplicationStack deploys via `.github/workflows/deploy-application.yml` on push to `main` under `application/**`
- The implementation agent (`agent/` and `buildspec.yml`) is pulled from `main` at build time — changes are available on the next triggered build without a CDK deploy
