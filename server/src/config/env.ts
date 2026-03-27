import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),
  APP_URL: z.string().url(),
  APP_PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ALLOWED_ORIGINS: z.string().transform(s => s.split(',')),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MINIO_BUCKET: z.string().default('product-images'),
  MINIO_USE_SSL: z.string().default('false').transform(v => v === 'true'),
  ML_APP_ID: z.string(),
  ML_CLIENT_SECRET: z.string(),
  ML_WEBHOOK_SECRET: z.string().optional(),
  ASAAS_API_KEY: z.string(),
  ASAAS_WEBHOOK_TOKEN: z.string(),
  ASAAS_SANDBOX: z.string().default('true').transform(v => v === 'true'),
  BILLING_CRON_SECRET: z.string(),
  ENCRYPTION_KEY: z.string().min(32),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
