import * as cdk from 'aws-cdk-lib/core';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface ImplementationCodeBuildProps {
  logGroup: logs.LogGroup;
}

export class ImplementationCodeBuild extends Construct {
  readonly project: codebuild.Project;

  constructor(scope: Construct, id: string, props: ImplementationCodeBuildProps) {
    super(scope, id);

    const role = new iam.Role(this, 'Role', {
      roleName: 'ai-team-member-codebuild-role',
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });

    role.addToPolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter/ai-team-member/*`,
      ],
    }));

    role.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    role.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }));

    this.project = new codebuild.Project(this, 'Project', {
      projectName: 'ai-team-member-implementation',
      role,
      source: codebuild.Source.gitHub({
        owner: 'michaelp1985',
        repo: 'ai-team-member',
        branchOrRef: 'main',
        webhook: false,
      }),
      environment: {
        buildImage: codebuild.LinuxArmBuildImage.AMAZON_LINUX_2023_STANDARD_3_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
      environmentVariables: {
        GITHUB_APP_ID_PARAM: { value: '/ai-team-member/github/app-id' },
        GITHUB_PRIVATE_KEY_PARAM: { value: '/ai-team-member/github/private-key' },
        BEDROCK_MODEL_ID: { value: 'us.amazon.nova-pro-v1:0' },
        AGENT_SPEC_PATH: { value: 'AGENT.md' },
        // ISSUE_NUMBER, REPO_FULL_NAME, REPO_OWNER, REPO_NAME — passed as overrides at trigger time
      },
      logging: {
        cloudWatch: {
          logGroup: props.logGroup,
          enabled: true,
        },
      },
    });
  }
}
