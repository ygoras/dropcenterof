import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validateBody } from '../../middleware/validateBody.js';
import { queryMany, queryOne, query } from '../../lib/db.js';
import { getTenantFilter } from '../../middleware/tenantScope.js';

const updateOrderStatusSchema = z.object({
  status: z.string(),
  notes: z.string().optional(),
});

export async function registerOrderRoutes(app: FastifyInstance) {
  // List orders
  app.get('/api/orders', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { tenantId, isAdmin } = getTenantFilter(request);
    const { status, limit, offset } = request.query as { status?: string; limit?: string; offset?: string };

    const params: unknown[] = [];
    const conditions: string[] = [];

    if (!isAdmin && tenantId) {
      params.push(tenantId);
      conditions.push(`o.tenant_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`o.status = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitVal = Math.min(parseInt(limit ?? '50'), 100);
    const offsetVal = parseInt(offset ?? '0');

    params.push(limitVal, offsetVal);

    const orders = await queryMany(
      `SELECT o.*, t.name as tenant_name
       FROM orders o
       LEFT JOIN tenants t ON t.id = o.tenant_id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return orders;
  });

  // Get single order
  app.get('/api/orders/:orderId', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const { tenantId, isAdmin } = getTenantFilter(request);

    const params: unknown[] = [orderId];
    let tenantWhere = '';
    if (!isAdmin && tenantId) {
      params.push(tenantId);
      tenantWhere = `AND o.tenant_id = $${params.length}`;
    }

    const order = await queryOne(
      `SELECT o.*, t.name as tenant_name
       FROM orders o
       LEFT JOIN tenants t ON t.id = o.tenant_id
       WHERE o.id = $1 ${tenantWhere}`,
      params
    );

    if (!order) return reply.status(404).send({ error: 'Pedido não encontrado' });
    return order;
  });

  // Update order status
  app.patch('/api/orders/:orderId/status', {
    preHandler: [authMiddleware, requireRole('admin', 'manager', 'operator'), validateBody(updateOrderStatusSchema)],
  }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const { status, notes } = request.body as z.infer<typeof updateOrderStatusSchema>;

    const order = await queryOne(
      `UPDATE orders SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status, notes, orderId]
    );

    if (!order) return reply.status(404).send({ error: 'Pedido não encontrado' });

    // Log audit
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'update_status', 'order', $2, $3)`,
      [request.user.sub, orderId, JSON.stringify({ new_status: status, notes })]
    );

    return order;
  });
}
