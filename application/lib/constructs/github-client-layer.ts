import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export class GitHubClientLayer extends Construct {
  readonly layer: lambda.LayerVersion;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // TODO: source must be built before deploy — see src/github-client/
    this.layer = new lambda.LayerVersion(this, 'Layer', {
      layerVersionName: 'ai-team-member-github-client',
      code: lambda.Code.fromAsset('src/github-client/dist'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_22_X],
      compatibleArchitectures: [lambda.Architecture.ARM_64],
    });
  }
}
