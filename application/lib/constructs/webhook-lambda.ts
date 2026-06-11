import * as cdk from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface WebhookLambdaProps {
  orchestratorFn: lambda.Function;
  logGroup: logs.LogGroup;
}

export class WebhookLambda extends Construct {
  readonly fn: lambda.Function;

  constructor(scope: Construct, id: string, props: WebhookLambdaProps) {
    super(scope, id);

    const role = iam.Role.fromRoleArn(
      this,
      'LambdaRole',
      cdk.Fn.importValue('ai-team-member-lambda-role-arn'),
    );

    // TODO: build src/webhook-receiver before deploy
    this.fn = new lambda.Function(this, 'Function', {
      functionName: 'ai-team-member-webhook-receiver',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('src/webhook-receiver/dist'),
      role,
      timeout: cdk.Duration.seconds(30),
      logGroup: props.logGroup,
      environment: {
        ORCHESTRATOR_FUNCTION_NAME: props.orchestratorFn.functionName,
        WEBHOOK_SECRET_PARAM: '/ai-team-member/github/webhook-secret',
      },
    });

    props.orchestratorFn.grantInvoke(this.fn);
  }
}
