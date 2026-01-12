/**
 * S3 helper functions for Lambda
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({});

/**
 * Get JSON object from S3
 */
export async function getJsonFromS3<T>(bucket: string, key: string): Promise<T> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3Client.send(command);
  const body = await response.Body?.transformToString();
  if (!body) {
    throw new Error(`Empty response from S3: ${key}`);
  }
  return JSON.parse(body) as T;
}

/**
 * Put JSON object to S3
 */
export async function putJsonToS3(bucket: string, key: string, data: unknown): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json',
  });
  await s3Client.send(command);
}
