import * as cdk from 'aws-cdk-lib/core';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { LogGroups } from './constructs/log-groups';
import { FailureDlq } from './constructs/failure-dlq';
import { OrchestratorLambda } from './constructs/orchestrator-lambda';
import { GitHubClientLayer } from './constructs/github-client-layer';
import { WebhookLambda } from './constructs/webhook-lambda';
import { ApiGateway } from './constructs/api-gateway';
import { ImplementationCodeBuild } from './constructs/implementation-codebuild';
import { ImplementationNotifier } from './constructs/implementation-notifier';

export class ApplicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const logGroups = new LogGroups(this, 'LogGroups', {});
    const failureDlq = new FailureDlq(this, 'FailureDlq');
    const githubClientLayer = new GitHubClientLayer(this, 'GitHubClientLayer');

    const buildTimeoutParam = new ssm.StringParameter(this, 'BuildTimeoutParam', {
      parameterName: '/ai-team-member/codebuild/timeout-minutes',
      stringValue: '30',
      description: 'Max timeout in minutes for the implementation CodeBuild agent',
    });

    const implementationCodeBuild = new ImplementationCodeBuild(this, 'ImplementationCodeBuild', {
      logGroup: logGroups.implementationBuild,
    });

    new ImplementationNotifier(this, 'ImplementationNotifier', {
      logGroup: logGroups.implementationNotifier,
      githubClientLayer: githubClientLayer.layer,
      codeBuildProjectName: implementationCodeBuild.project.projectName,
    });

    const orchestrator = new OrchestratorLambda(this, 'OrchestratorLambda', {
      logGroup: logGroups.orchestrator,
      failureDlq: failureDlq.queue,
      githubClientLayer: githubClientLayer.layer,
      codeBuildProjectName: implementationCodeBuild.project.projectName,
      buildTimeoutParamName: buildTimeoutParam.parameterName,
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
