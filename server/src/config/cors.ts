import type { FastifyCorsOptions } from '@fastify/cors';
import { env } from './env.js';

export const corsOptions: FastifyCorsOptions = {
  origin: env.ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
};
