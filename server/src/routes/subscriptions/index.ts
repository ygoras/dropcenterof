import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validateBody } from '../../middleware/validateBody.js';
import { queryMany, queryOne, query } from '../../lib/db.js';
import { getTenantFilter } from '../../middleware/tenantScope.js';

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

  // List all subscriptions (admin)
  app.get('/api/subscriptions', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async () => {
    return queryMany(
      `SELECT s.*, t.name as tenant_name, p.name as plan_name, p.price as plan_price
       FROM subscriptions s
       JOIN tenants t ON t.id = s.tenant_id
       JOIN plans p ON p.id = s.plan_id
       ORDER BY s.created_at DESC`
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
    const sub = await queryOne(
      `UPDATE subscriptions SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      params
    );

    if (!sub) return reply.status(404).send({ error: 'Assinatura não encontrada' });
    return sub;
  });
}
