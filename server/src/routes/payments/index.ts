import type { FastifyInstance } from 'fastify';
import { registerAsaasPixRoutes } from './asaasPix.js';
import { registerAsaasWebhookRoutes } from './asaasWebhook.js';

export async function registerPaymentRoutes(app: FastifyInstance) {
  await registerAsaasPixRoutes(app);
  await registerAsaasWebhookRoutes(app);
}
