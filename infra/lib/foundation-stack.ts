import * as cdk from 'aws-cdk-lib/core';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class FoundationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, { ...props, terminationProtection: true });

    const table = new dynamodb.Table(this, 'AgentStateTable', {
      tableName: 'ai-team-member-state',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      roleName: 'ai-team-member-lambda-role',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    table.grantReadWriteData(lambdaRole);

    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [`arn:aws:ssm:us-east-2:${this.account}:parameter/ai-team-member/*`],
    }));

    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sqs:SendMessage'],
      resources: [`arn:aws:sqs:us-east-2:${this.account}:ai-team-member-*`],
    }));

    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    new cdk.CfnOutput(this, 'TableNameOutput', {
      exportName: 'ai-team-member-table-name',
      value: table.tableName,
    });

    new cdk.CfnOutput(this, 'TableArnOutput', {
      exportName: 'ai-team-member-table-arn',
      value: table.tableArn,
    });

    new cdk.CfnOutput(this, 'LambdaRoleArnOutput', {
      exportName: 'ai-team-member-lambda-role-arn',
      value: lambdaRole.roleArn,
    });
  }
}
