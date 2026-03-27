import { Client } from 'minio';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const minioClient = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

async function ensureBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(env.MINIO_BUCKET);
  if (!exists) {
    await minioClient.makeBucket(env.MINIO_BUCKET, 'us-east-1');
    // Set public read policy for product images
    const policy = {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${env.MINIO_BUCKET}/*`],
      }],
    };
    await minioClient.setBucketPolicy(env.MINIO_BUCKET, JSON.stringify(policy));
    logger.info(`Bucket "${env.MINIO_BUCKET}" created with public read policy`);
  }
}

let bucketReady = false;

export const storageService = {
  async upload(filename: string, buffer: Buffer, contentType: string): Promise<string> {
    if (!bucketReady) {
      await ensureBucket();
      bucketReady = true;
    }

    await minioClient.putObject(env.MINIO_BUCKET, filename, buffer, buffer.length, {
      'Content-Type': contentType,
    });

    return `${env.APP_URL}/storage/${env.MINIO_BUCKET}/${filename}`;
  },

  async remove(filename: string): Promise<void> {
    await minioClient.removeObject(env.MINIO_BUCKET, filename);
  },

  async getUrl(filename: string): Promise<string> {
    return `${env.APP_URL}/storage/${env.MINIO_BUCKET}/${filename}`;
  },
};
