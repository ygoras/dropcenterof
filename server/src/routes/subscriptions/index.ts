import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validateBody } from '../../middleware/validateBody.js';
import { queryMany, queryOne, query } from '../../lib/db.js';
import { getTenantFilter } from '../../middleware/tenantScope.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

const ASAAS_API = env.ASAAS_SANDBOX
  ? 'https://sandbox.asaas.com/api/v3'
  : 'https://api.asaas.com/v3';

export async function registerSubscriptionRoutes(app: FastifyInstance) {
  // Get current subscription (seller)
  app.get('/api/subscriptions/mine', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    if (!tenantId) return reply.status(400).send({ error: 'Sem tenant associado' });

    const subscription = await queryOne(
      `SELECT s.*, p.name as plan_name, p.price as plan_price, p.features as plan_features
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.tenant_id = $1
       ORDER BY s.created_at DESC LIMIT 1`,
      [tenantId]
    );

    return subscription ?? { status: 'none' };
  });

  // List subscriptions (admin sees all, seller sees own)
  app.get('/api/subscriptions', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { tenantId, isAdmin } = getTenantFilter(request);
    const query_params = request.query as { tenant_id?: string; status?: string };

    // Sellers can only see their own
    const filterTenantId = isAdmin ? (query_params.tenant_id || null) : tenantId;

    let whereClause = '';
    const params: unknown[] = [];
    let idx = 1;

    if (filterTenantId) {
      whereClause = `WHERE s.tenant_id = $${idx}`;
      params.push(filterTenantId);
      idx++;
    }

    if (query_params.status) {
      const statuses = query_params.status.split(',').map(s => s.trim());
      whereClause += whereClause ? ' AND ' : 'WHERE ';
      whereClause += `s.status IN (${statuses.map(() => `$${idx++}`).join(',')})`;
      params.push(...statuses);
    }

    return queryMany(
      `SELECT s.*, t.name as tenant_name, p.name as plan_name, p.price as plan_price,
              pr.name as seller_name, pr.email as seller_email
       FROM subscriptions s
       JOIN tenants t ON t.id = s.tenant_id
       JOIN plans p ON p.id = s.plan_id
       LEFT JOIN profiles pr ON pr.tenant_id = s.tenant_id
       ${whereClause}
       ORDER BY s.created_at DESC`,
      params
    );
  });

  // Update subscription (admin)
  app.patch('/api/subscriptions/:subscriptionId', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async (request, reply) => {
    const { subscriptionId } = request.params as { subscriptionId: string };
    const { status, plan_id } = request.body as { status?: string; plan_id?: string };

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (status) { setClauses.push(`status = $${idx}`); params.push(status); idx++; }
    if (plan_id) { setClauses.push(`plan_id = $${idx}`); params.push(plan_id); idx++; }

    if (setClauses.length === 0) return reply.status(400).send({ error: 'Nada para atualizar' });

    params.push(subscriptionId);
    const sub = await queryOne<{ id: string; tenant_id: string; status: string }>(
      `UPDATE subscriptions SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      params
    );

    if (!sub) return reply.status(404).send({ error: 'Assinatura não encontrada' });

    // When plan changes: cancel old pending/expired charges and reactivate subscription
    if (plan_id) {
      // Cancel old pending/expired payments in DB and Asaas
      const oldPayments = await queryMany<{ id: string; payment_gateway_id: string | null; status: string }>(
        `SELECT id, payment_gateway_id, status FROM payments
         WHERE subscription_id = $1 AND status IN ('pending', 'expired')`,
        [subscriptionId]
      );

      for (const payment of oldPayments) {
        // Cancel in Asaas if has gateway ID
        if (payment.payment_gateway_id && env.ASAAS_API_KEY) {
          try {
            await fetch(`${ASAAS_API}/payments/${payment.payment_gateway_id}`, {
              method: 'DELETE',
              headers: { access_token: env.ASAAS_API_KEY },
            });
          } catch (err) {
            logger.warn({ paymentId: payment.payment_gateway_id }, 'Failed to cancel Asaas charge on plan change');
          }
        }
        // Mark as expired in DB
        await query(`UPDATE payments SET status = 'expired', notes = 'Cancelado — mudança de plano' WHERE id = $1`, [payment.id]);
      }

      // Reactivate subscription (plan was changed, old debts cleared)
      await query(
        `UPDATE subscriptions SET status = 'active', blocked_at = NULL, updated_at = NOW() WHERE id = $1`,
        [subscriptionId]
      );

      // Reactivate profiles
      if (sub.tenant_id) {
        await query(`UPDATE profiles SET is_active = TRUE WHERE tenant_id = $1`, [sub.tenant_id]);
      }

      logger.info({ subscriptionId, oldPaymentsCancelled: oldPayments.length, newPlanId: plan_id }, 'Plan changed — old charges cancelled');
    }

    // Re-fetch updated subscription
    const updated = await queryOne(
      `SELECT * FROM subscriptions WHERE id = $1`,
      [subscriptionId]
    );

    return updated;
  });
}
