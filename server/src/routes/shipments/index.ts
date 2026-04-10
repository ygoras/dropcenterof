import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { queryMany, queryOne, query } from '../../lib/db.js';
import { getTenantFilter } from '../../middleware/tenantScope.js';

export async function registerShipmentRoutes(app: FastifyInstance) {
  // List shipments
  app.get('/api/shipments', {
    preHandler: [authMiddleware, requireRole('admin', 'manager', 'operator')],
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
    preHandler: [authMiddleware, requireRole('admin', 'manager', 'operator')],
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
    preHandler: [authMiddleware, requireRole('admin', 'manager', 'operator')],
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

  // Update shipment by order ID (used by operator pages)
  app.patch('/api/shipments/by-order/:orderId', {
    preHandler: [authMiddleware, requireRole('admin', 'manager', 'operator')],
  }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const body = request.body as {
      status?: string;
      tracking_code?: string;
      carrier?: string;
      shipped_at?: string;
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
    if (body.shipped_at) { updates.push(`shipped_at = $${idx++}`); values.push(body.shipped_at); }

    if (updates.length === 0) {
      return reply.status(400).send({ error: 'Nenhum campo para atualizar' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(orderId);

    const result = await queryOne(
      `UPDATE shipments SET ${updates.join(', ')} WHERE order_id = $${idx} RETURNING *`,
      values
    );

    if (!result) {
      return reply.status(404).send({ error: 'Envio não encontrado para este pedido' });
    }

    return result;
  });

  // Backfill logistic_type for existing shipments — admin/manager
  app.post('/api/shipments/sync-logistics', {
    preHandler: [authMiddleware, requireRole('admin', 'manager', 'operator', 'seller')],
  }, async (request, reply) => {
    const ML_API = 'https://api.mercadolibre.com';
    const { tenantId, isAdmin } = getTenantFilter(request);

    // Fetch shipments without logistic_type that have ml_shipment_id
    const tenantFilter = !isAdmin && tenantId ? 'AND o.tenant_id = $1' : '';
    const params = !isAdmin && tenantId ? [tenantId] : [];

    const shipments = await queryMany<{ id: string; ml_shipment_id: string; tenant_id: string }>(
      `SELECT s.id, s.ml_shipment_id, o.tenant_id
       FROM shipments s
       JOIN orders o ON o.id = s.order_id
       WHERE s.logistic_type IS NULL AND s.ml_shipment_id IS NOT NULL ${tenantFilter}
       LIMIT 100`,
      params
    );

    let updated = 0;
    for (const ship of shipments) {
      const cred = await queryOne<{ access_token: string }>(
        `SELECT access_token FROM ml_credentials WHERE tenant_id = $1 LIMIT 1`,
        [ship.tenant_id]
      );
      if (!cred?.access_token) continue;

      try {
        const shipRes = await fetch(`${ML_API}/shipments/${ship.ml_shipment_id}`, {
          headers: {
            Authorization: `Bearer ${cred.access_token}`,
            Accept: 'application/json',
            'x-format-new': 'true',
          },
        });
        if (!shipRes.ok) continue;

        const shipData: any = await shipRes.json();
        const logisticType = shipData.logistic_type || shipData.logistic?.type || null;
        if (logisticType) {
          await query(`UPDATE shipments SET logistic_type = $1 WHERE id = $2`, [logisticType, ship.id]);
          updated++;
        }
      } catch { /* skip */ }
    }

    return reply.send({ total: shipments.length, updated });
  });
}
