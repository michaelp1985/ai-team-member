import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { LogGroups } from './constructs/log-groups';
import { FailureDlq } from './constructs/failure-dlq';
import { OrchestratorLambda } from './constructs/orchestrator-lambda';
import { GitHubClientLayer } from './constructs/github-client-layer';
import { WebhookLambda } from './constructs/webhook-lambda';
import { ApiGateway } from './constructs/api-gateway';

export class ApplicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const logGroups = new LogGroups(this, 'LogGroups', {});
    const failureDlq = new FailureDlq(this, 'FailureDlq');
    const githubClientLayer = new GitHubClientLayer(this, 'GitHubClientLayer');

    const orchestrator = new OrchestratorLambda(this, 'OrchestratorLambda', {
      logGroup: logGroups.orchestrator,
      failureDlq: failureDlq.queue,
      githubClientLayer: githubClientLayer.layer,
    });

    const webhookLambda = new WebhookLambda(this, 'WebhookLambda', {
      orchestratorFn: orchestrator.fn,
      logGroup: logGroups.webhookReceiver,
    });

    new ApiGateway(this, 'ApiGateway', {
      webhookHandler: webhookLambda.fn,
    });
  }
}
