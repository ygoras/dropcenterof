import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validateBody } from '../../middleware/validateBody.js';
import { queryMany, queryOne, query } from '../../lib/db.js';
import { getTenantFilter } from '../../middleware/tenantScope.js';

const updateStockSchema = z.object({
  quantity: z.number().int().min(0),
});

export async function registerStockRoutes(app: FastifyInstance) {
  // List stock
  app.get('/api/stock', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { tenantId, isAdmin } = getTenantFilter(request);
    const params: unknown[] = [];
    let tenantWhere = '';

    if (!isAdmin && tenantId) {
      params.push(tenantId);
      tenantWhere = `WHERE p.tenant_id = $${params.length}`;
    }

    return queryMany(
      `SELECT s.*, p.name as product_name, p.sku, p.images
       FROM stock s
       JOIN products p ON p.id = s.product_id
       ${tenantWhere}
       ORDER BY p.name`,
      params
    );
  });

  // Update stock quantity
  app.patch('/api/stock/:productId', {
    preHandler: [authMiddleware, requireRole('admin', 'manager', 'seller', 'operator'), validateBody(updateStockSchema)],
  }, async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const { quantity } = request.body as z.infer<typeof updateStockSchema>;

    const stock = await queryOne(
      `INSERT INTO stock (product_id, quantity)
       VALUES ($1, $2)
       ON CONFLICT (product_id) DO UPDATE SET quantity = $2, updated_at = NOW()
       RETURNING *`,
      [productId, quantity]
    );

    return stock;
  });
}
