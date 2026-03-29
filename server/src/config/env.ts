import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  CLERK_SECRET_KEY: z.string().startsWith('sk_'),
  CLERK_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
  // Legacy JWT — kept temporarily for migration period, can remove after full Clerk migration
  JWT_SECRET: z.string().min(32).optional(),
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
  CLERK_WEBHOOK_SECRET: z.string().optional(),
  BILLING_CRON_SECRET: z.string(),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
