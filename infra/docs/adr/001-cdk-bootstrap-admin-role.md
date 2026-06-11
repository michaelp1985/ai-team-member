# ADR 001 — CDK Bootstrap CloudFormation Execution Role

## Status
Accepted

## Context
CDK bootstrap creates a `cfn-exec-role` that CloudFormation assumes when deploying stacks. By default this role is granted `AdministratorAccess`. CDK does this because it cannot know ahead of time what resource types a stack will create.

The alternative is to re-bootstrap with a scoped-down policy covering only the AWS services this project uses (Lambda, API Gateway, SQS, DynamoDB, Bedrock, IAM, SSM, CloudWatch).

## Decision
Accept the default `AdministratorAccess` on the `cfn-exec-role` for this project.

## Consequences
- Simpler setup — no custom policy to maintain or update as new services are added.
- Accepted risk: if the CDK bootstrap stack or the deploy pipeline were compromised, the blast radius would be the full AWS account.
- Mitigated by: this is a personal AWS account used solely for this project; there are no production workloads, sensitive data, or other tenants in the account.
- If this project graduates beyond a personal POC, the `cfn-exec-role` should be re-scoped via `cdk bootstrap --cloudformation-execution-policies`.
