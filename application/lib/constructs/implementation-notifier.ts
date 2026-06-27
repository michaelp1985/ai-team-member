import * as cdk from 'aws-cdk-lib/core';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface ImplementationNotifierProps {
  logGroup: logs.LogGroup;
  githubClientLayer: lambda.ILayerVersion;
  codeBuildProjectName: string;
}

export class ImplementationNotifier extends Construct {
  readonly fn: lambda.Function;

  constructor(scope: Construct, id: string, props: ImplementationNotifierProps) {
    super(scope, id);

    const role = iam.Role.fromRoleArn(
      this,
      'LambdaRole',
      cdk.Fn.importValue('ai-team-member-lambda-role-arn'),
    );

    this.fn = new lambda.Function(this, 'Function', {
      functionName: 'ai-team-member-implementation-notifier',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('src/implementation-notifier/dist'),
      layers: [props.githubClientLayer],
      role,
      timeout: cdk.Duration.seconds(30),
      logGroup: props.logGroup,
      environment: {
        GITHUB_APP_ID_PARAM: '/ai-team-member/github/app-id',
        GITHUB_PRIVATE_KEY_PARAM: '/ai-team-member/github/private-key',
      },
    });

    const rule = new events.Rule(this, 'BuildStateChangeRule', {
      ruleName: 'ai-team-member-implementation-build-state',
      eventPattern: {
        source: ['aws.codebuild'],
        detailType: ['CodeBuild Build State Change'],
        detail: {
          'project-name': [props.codeBuildProjectName],
          'build-status': ['SUCCEEDED', 'FAILED', 'STOPPED'],
        },
      },
    });

    rule.addTarget(new targets.LambdaFunction(this.fn));
  }
}
