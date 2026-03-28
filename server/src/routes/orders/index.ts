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
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        params.push(statuses[0]);
        conditions.push(`o.status = $${params.length}`);
      } else if (statuses.length > 1) {
        const placeholders = statuses.map(s => { params.push(s); return `$${params.length}`; });
        conditions.push(`o.status IN (${placeholders.join(',')})`);
      }
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

  // Update order status (via /status path)
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

  // Update order (generic PATCH - used by operator pages)
  app.patch('/api/orders/:orderId', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const body = request.body as { status?: string; notes?: string; tracking_code?: string } | null;

    if (!body) return reply.status(400).send({ error: 'Body vazio' });

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (body.status) { updates.push(`status = $${idx++}`); values.push(body.status); }
    if (body.notes) { updates.push(`notes = $${idx++}`); values.push(body.notes); }
    if (body.tracking_code) { updates.push(`tracking_code = $${idx++}`); values.push(body.tracking_code); }

    if (updates.length === 0) return reply.status(400).send({ error: 'Nada para atualizar' });

    updates.push(`updated_at = NOW()`);
    values.push(orderId);

    const order = await queryOne(
      `UPDATE orders SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (!order) return reply.status(404).send({ error: 'Pedido não encontrado' });
    return order;
  });

  // Get order items (used by Operacao.tsx)
  app.get('/api/order-items', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { tenantId, isAdmin } = getTenantFilter(request);
    const { order_id } = request.query as { order_id?: string };

    let tenantCondition = '';
    const params: unknown[] = [];

    if (!isAdmin && tenantId) {
      params.push(tenantId);
      tenantCondition = `AND o.tenant_id = $${params.length}`;
    }

    if (order_id) {
      params.push(order_id);
      tenantCondition += ` AND o.id = $${params.length}`;
    }

    // Extract items from orders.items JSONB array and join with products
    return queryMany(
      `SELECT o.id as order_id, o.order_number, o.tenant_id,
              item->>'product_id' as product_id,
              COALESCE(item->>'sku', p.sku) as sku,
              COALESCE(item->>'name', p.name) as product_name,
              (item->>'quantity')::int as quantity,
              (item->>'unit_price')::numeric as unit_price
       FROM orders o,
            jsonb_array_elements(o.items) as item
       LEFT JOIN products p ON p.id = (item->>'product_id')::uuid
       WHERE o.status NOT IN ('cancelled') ${tenantCondition}
       ORDER BY o.created_at DESC
       LIMIT 500`,
      params
    );
  });
}
