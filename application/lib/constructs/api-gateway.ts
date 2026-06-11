import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface ApiGatewayProps {
  webhookHandler: lambda.IFunction;
}

export class ApiGateway extends Construct {
  readonly api: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiGatewayProps) {
    super(scope, id);

    // TODO: GitHub IP allowlist requires WAF — HMAC validation in Lambda is the current security control
    this.api = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'ai-team-member',
      createDefaultStage: false,
    });

    new apigwv2.HttpStage(this, 'DefaultStage', {
      httpApi: this.api,
      stageName: '$default',
      autoDeploy: true,
      throttle: {
        rateLimit: 10,
        burstLimit: 50,
      },
    });

    this.api.addRoutes({
      path: '/webhook',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('WebhookIntegration', props.webhookHandler),
    });
  }
}
