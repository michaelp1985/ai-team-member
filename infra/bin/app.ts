#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { FoundationStack } from '../lib/foundation-stack';

const app = new cdk.App();

new FoundationStack(app, 'FoundationStack', {
  env: { account: 'REDACTED', region: 'us-east-2' },
});
