/**
 * Dashboard Lambda Handler
 * Serves HTML dashboard and API endpoints
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { getHtmlTemplate } from './html.js';
import * as fs from 'fs';
import * as path from 'path';

const s3Client = new S3Client({});
const lambdaClient = new LambdaClient({});
const BUCKET = process.env.BUCKET || `sportline-data-${process.env.USER || 'dev'}`;

interface LambdaEvent {
  rawPath: string;
  requestContext: {
    http: {
      method: string;
    };
  };
}

/**
 * Get bundled app JS (loaded at init)
 */
let cachedAppJs: string | null = null;
function getAppJs(): string {
  if (cachedAppJs) return cachedAppJs;

  try {
    const appPath = path.join(process.cwd(), 'app.js');
    cachedAppJs = fs.readFileSync(appPath, 'utf-8');
    return cachedAppJs;
  } catch {
    return '// App JS not found';
  }
}

/**
 * Lambda handler
 */
export async function handler(event: LambdaEvent) {
  const { rawPath, requestContext } = event;
  const method = requestContext.http.method;

  console.log({ rawPath, method });

  // API: Get recommendations
  if (rawPath === '/api/recs' && method === 'GET') {
    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET,
        Key: 'daily/recs.json',
      });
      const response = await s3Client.send(command);
      const body = await response.Body?.transformToString();

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body,
      };
    } catch (_error) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to load recommendations' }),
      };
    }
  }

  // API: Trigger refresh (invoke Update Lambda)
  if (rawPath === '/api/refresh' && method === 'POST') {
    try {
      const updateLambda =
        process.env.UPDATE_LAMBDA || `Sportline-Update-${process.env.USER || 'dev'}`;
      const command = new InvokeCommand({
        FunctionName: updateLambda,
        InvocationType: 'Event', // Async
      });
      await lambdaClient.send(command);

      return {
        statusCode: 202,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Refresh triggered' }),
      };
    } catch (_error) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to trigger refresh' }),
      };
    }
  }

  // Default: Serve HTML dashboard
  const appJs = getAppJs();
  const html = getHtmlTemplate(appJs);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache',
    },
    body: html,
  };
}
