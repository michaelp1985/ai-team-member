#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { ApplicationStack } from '../lib/application-stack';

const app = new cdk.App();

new ApplicationStack(app, 'ApplicationStack', {
  env: { account: 'REDACTED', region: 'us-east-2' },
});
