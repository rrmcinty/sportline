import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

export interface SportlineStackProps extends cdk.StackProps {
  environment: string;
}

export class SportlineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SportlineStackProps) {
    super(scope, id, props);

    const { environment: env } = props;

    // S3 bucket for models, features, and daily recommendations
    const bucket = new s3.Bucket(this, 'DataBucket', {
      bucketName: `sportline-data-${env}`,
      versioned: true,
      lifecycleRules: [
        {
          id: 'DeleteDailyDataAfter2Days',
          prefix: 'daily/',
          expiration: cdk.Duration.days(2),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep data on stack deletion
    });

    // Update Lambda - Fetches odds, runs predictions, writes recommendations
    const updateLambda = new lambda.Function(this, 'UpdateLambda', {
      functionName: `Sportline-Update-${env}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/update/dist'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        BUCKET: bucket.bucketName,
      },
    });

    // Grant S3 permissions to Update Lambda
    bucket.grantReadWrite(updateLambda);

    // Dashboard Lambda - Serves mobile UI
    const dashboardLambda = new lambda.Function(this, 'DashboardLambda', {
      functionName: `Sportline-Dashboard-${env}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambda/dashboard/dist'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        BUCKET: bucket.bucketName,
        UPDATE_LAMBDA: updateLambda.functionName,
      },
    });

    // Grant S3 read permissions to Dashboard Lambda
    bucket.grantRead(dashboardLambda);

    // Grant Dashboard Lambda permission to invoke Update Lambda
    updateLambda.grantInvoke(dashboardLambda);

    // Add Function URL to Dashboard Lambda (public HTTPS endpoint)
    const fnUrl = dashboardLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.ALL],
      },
    });

    // EventBridge rule - Trigger Update Lambda daily at 8am EST (1pm UTC)
    const dailyRule = new events.Rule(this, 'DailyUpdate', {
      ruleName: `Sportline-DailyUpdate-${env}`,
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '13', // 8am EST = 1pm UTC
      }),
    });

    dailyRule.addTarget(new targets.LambdaFunction(updateLambda));

    // Outputs
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: fnUrl.url,
      description: 'Dashboard Function URL (open on mobile)',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
      description: 'S3 bucket for models and recommendations',
    });

    new cdk.CfnOutput(this, 'UpdateLambdaName', {
      value: updateLambda.functionName,
      description: 'Update Lambda function name',
    });

    new cdk.CfnOutput(this, 'DashboardLambdaName', {
      value: dashboardLambda.functionName,
      description: 'Dashboard Lambda function name',
    });
  }
}
