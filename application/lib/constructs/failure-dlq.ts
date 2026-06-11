import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

export class FailureDlq extends Construct {
  readonly queue: sqs.Queue;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.queue = new sqs.Queue(this, 'Queue', {
      queueName: 'ai-team-member-orchestrator-failure',
      retentionPeriod: cdk.Duration.days(14),
    });
  }
}
