import * as logs from 'aws-cdk-lib/aws-logs';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

export interface LogGroupsProps {}

export class LogGroups extends Construct {
  readonly webhookReceiver: logs.LogGroup;
  readonly orchestrator: logs.LogGroup;
  readonly implementationBuild: logs.LogGroup;
  readonly implementationNotifier: logs.LogGroup;

  constructor(scope: Construct, id: string, _props: LogGroupsProps) {
    super(scope, id);

    this.webhookReceiver = new logs.LogGroup(this, 'WebhookReceiver', {
      logGroupName: '/aws/lambda/ai-team-member-webhook-receiver',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.orchestrator = new logs.LogGroup(this, 'Orchestrator', {
      logGroupName: '/aws/lambda/ai-team-member-orchestrator',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.implementationBuild = new logs.LogGroup(this, 'ImplementationBuild', {
      logGroupName: '/aws/codebuild/ai-team-member-implementation',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.implementationNotifier = new logs.LogGroup(this, 'ImplementationNotifier', {
      logGroupName: '/aws/lambda/ai-team-member-implementation-notifier',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
