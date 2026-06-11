import * as cdk from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as destinations from 'aws-cdk-lib/aws-lambda-destinations';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface OrchestratorLambdaProps {
  logGroup: logs.LogGroup;
  failureDlq: sqs.Queue;
  githubClientLayer: lambda.ILayerVersion;
}

export class OrchestratorLambda extends Construct {
  readonly fn: lambda.Function;

  constructor(scope: Construct, id: string, props: OrchestratorLambdaProps) {
    super(scope, id);

    const role = iam.Role.fromRoleArn(
      this,
      'LambdaRole',
      cdk.Fn.importValue('ai-team-member-lambda-role-arn'),
    );

    this.fn = new lambda.Function(this, 'Function', {
      functionName: 'ai-team-member-orchestrator',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('src/orchestrator/dist'),
      layers: [props.githubClientLayer],
      role,
      timeout: cdk.Duration.minutes(15),
      logGroup: props.logGroup,
      environment: {
        TABLE_NAME: cdk.Fn.importValue('ai-team-member-table-name'),
        GITHUB_APP_ID_PARAM: '/ai-team-member/github/app-id',
        GITHUB_PRIVATE_KEY_PARAM: '/ai-team-member/github/private-key',
        BEDROCK_MODEL_ID: 'us.amazon.nova-pro-v1:0',
      },
    });

    this.fn.configureAsyncInvoke({
      retryAttempts: 2,
      onFailure: new destinations.SqsDestination(props.failureDlq),
    });
  }
}
