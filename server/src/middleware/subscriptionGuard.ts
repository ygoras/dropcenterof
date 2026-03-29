import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../config/database.js';

// Routes that sellers can access WITHOUT active subscription
// (needed to view plan, pay, check auth, etc.)
const ALLOWED_ROUTES = [
  '/api/auth/',
  '/api/payments/',
  '/api/asaas-pix',
  '/api/subscriptions',
  '/api/plans',
  '/api/notifications',
  '/api/events/',
  '/api/health',
  '/api/webhooks/',
];

/**
 * Register a global hook that blocks sellers without active subscription.
 * Admins, managers, and operators bypass. Whitelisted routes bypass.
 * This is SERVER-SIDE enforcement — prevents API bypass via direct HTTP calls.
 */
export function registerSubscriptionGuard(app: FastifyInstance): void {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip if no user (unauthenticated routes like login, webhooks)
    if (!request.user) return;

    // Admins, managers, operators bypass
    const bypassRoles = ['admin', 'manager', 'operator'];
    if (request.user.roles.some(r => bypassRoles.includes(r))) return;

    // Whitelisted routes bypass (seller needs to pay, view plans, etc.)
    const url = request.url.split('?')[0];
    if (ALLOWED_ROUTES.some(route => url.startsWith(route))) return;

    // Sellers without tenant_id can't have a subscription
    if (!request.user.tenantId) {
      return reply.status(403).send({
        error: 'Assinatura inativa. Realize o pagamento para continuar.',
        code: 'SUBSCRIPTION_INACTIVE',
      });
    }

    // Check subscription status (direct pool query, bypasses RLS)
    const result = await pool.query<{ status: string }>(
      `SELECT status FROM subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [request.user.tenantId]
    );

    const status = result.rows[0]?.status;

    if (!status || status !== 'active') {
      return reply.status(403).send({
        error: 'Assinatura inativa. Realize o pagamento para continuar.',
        code: 'SUBSCRIPTION_INACTIVE',
        subscription_status: status || 'none',
      });
    }
  });
}
