#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SportlineStack } from '../lib/sportline-stack';

const app = new cdk.App();

// Get environment from context or default to username
const envName = app.node.tryGetContext('env') || process.env.ENV || process.env.USER || 'dev';

new SportlineStack(app, `SportlineStack-${envName}`, {
  environment: envName,
  stackName: `SportlineStack-${envName}`,
  description: `Sportline betting dashboard infrastructure (${envName})`,
});
