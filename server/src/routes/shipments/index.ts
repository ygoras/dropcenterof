import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware/auth.js';
import { queryMany, queryOne, query } from '../../lib/db.js';
import { getTenantFilter } from '../../middleware/tenantScope.js';

export async function registerShipmentRoutes(app: FastifyInstance) {
  // List shipments
  app.get('/api/shipments', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { tenantId, isAdmin } = getTenantFilter(request);
    const { limit, offset } = request.query as { limit?: string; offset?: string };
    const limitVal = Math.min(parseInt(limit ?? '50'), 100);
    const offsetVal = parseInt(offset ?? '0');

    const tenantCondition = !isAdmin && tenantId
      ? `WHERE o.tenant_id = $3`
      : '';

    const params: any[] = [limitVal, offsetVal];
    if (!isAdmin && tenantId) params.push(tenantId);

    return queryMany(
      `SELECT s.*, o.order_number, o.tenant_id, o.customer_name
       FROM shipments s
       JOIN orders o ON o.id = s.order_id
       ${tenantCondition}
       ORDER BY s.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );
  });

  // Get single shipment
  app.get('/api/shipments/:shipmentId', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { shipmentId } = request.params as { shipmentId: string };

    const shipment = await queryOne(
      `SELECT s.*, o.order_number, o.tenant_id, o.customer_name
       FROM shipments s
       JOIN orders o ON o.id = s.order_id
       WHERE s.id = $1`,
      [shipmentId]
    );

    if (!shipment) {
      return reply.status(404).send({ error: 'Envio não encontrado' });
    }

    return shipment;
  });

  // Update shipment status
  app.patch('/api/shipments/:shipmentId', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { shipmentId } = request.params as { shipmentId: string };
    const body = request.body as {
      status?: string;
      tracking_code?: string;
      carrier?: string;
    } | null;

    if (!body) {
      return reply.status(400).send({ error: 'Body vazio' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (body.status) { updates.push(`status = $${idx++}`); values.push(body.status); }
    if (body.tracking_code) { updates.push(`tracking_code = $${idx++}`); values.push(body.tracking_code); }
    if (body.carrier) { updates.push(`carrier = $${idx++}`); values.push(body.carrier); }

    if (updates.length === 0) {
      return reply.status(400).send({ error: 'Nenhum campo para atualizar' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(shipmentId);

    const result = await queryOne(
      `UPDATE shipments SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (!result) {
      return reply.status(404).send({ error: 'Envio não encontrado' });
    }

    return result;
  });
}
