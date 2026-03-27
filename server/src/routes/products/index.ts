import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validateBody } from '../../middleware/validateBody.js';
import { queryMany, queryOne, query } from '../../lib/db.js';
import { getTenantFilter } from '../../middleware/tenantScope.js';

const createProductSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  description: z.string().optional(),
  cost_price: z.number().min(0).optional(),
  sale_price: z.number().min(0).optional(),
  category_id: z.string().uuid().optional(),
  images: z.array(z.string()).optional(),
  weight: z.number().min(0).optional(),
  width: z.number().min(0).optional(),
  height: z.number().min(0).optional(),
  length: z.number().min(0).optional(),
  status: z.enum(['active', 'inactive', 'draft']).default('draft'),
});

const updateProductSchema = createProductSchema.partial();

export async function registerProductRoutes(app: FastifyInstance) {
  // List products
  app.get('/api/products', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { tenantId, isAdmin } = getTenantFilter(request);
    const params: unknown[] = [];
    let whereClause = '';

    if (!isAdmin && tenantId) {
      params.push(tenantId);
      whereClause = `WHERE p.tenant_id = $${params.length}`;
    }

    const products = await queryMany(
      `SELECT p.*, pc.name as category_name,
              COALESCE(s.quantity, 0) as stock_quantity
       FROM products p
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       LEFT JOIN stock s ON s.product_id = p.id
       ${whereClause}
       ORDER BY p.created_at DESC`
      , params
    );
    return products;
  });

  // Get single product
  app.get('/api/products/:productId', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const { tenantId, isAdmin } = getTenantFilter(request);

    const params: unknown[] = [productId];
    let tenantWhere = '';
    if (!isAdmin && tenantId) {
      params.push(tenantId);
      tenantWhere = `AND p.tenant_id = $${params.length}`;
    }

    const product = await queryOne(
      `SELECT p.*, pc.name as category_name,
              COALESCE(s.quantity, 0) as stock_quantity
       FROM products p
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       LEFT JOIN stock s ON s.product_id = p.id
       WHERE p.id = $1 ${tenantWhere}`,
      params
    );

    if (!product) return reply.status(404).send({ error: 'Produto não encontrado' });
    return product;
  });

  // Create product
  app.post('/api/products', {
    preHandler: [authMiddleware, requireRole('admin', 'manager', 'seller'), validateBody(createProductSchema)],
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof createProductSchema>;
    const tenantId = request.user.tenantId;

    const product = await queryOne(
      `INSERT INTO products (name, sku, description, cost_price, sale_price, category_id, images, weight, width, height, length, status, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [body.name, body.sku, body.description, body.cost_price, body.sale_price, body.category_id,
       JSON.stringify(body.images ?? []), body.weight, body.width, body.height, body.length, body.status, tenantId]
    );

    return reply.status(201).send(product);
  });

  // Update product
  app.patch('/api/products/:productId', {
    preHandler: [authMiddleware, requireRole('admin', 'manager', 'seller'), validateBody(updateProductSchema)],
  }, async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const body = request.body as z.infer<typeof updateProductSchema>;
    const { tenantId, isAdmin } = getTenantFilter(request);

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) {
        const dbKey = key === 'images' ? key : key;
        setClauses.push(`${dbKey} = $${idx}`);
        params.push(key === 'images' ? JSON.stringify(value) : value);
        idx++;
      }
    }

    if (setClauses.length === 0) {
      return reply.status(400).send({ error: 'Nenhum campo para atualizar' });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(productId);
    let tenantWhere = '';
    if (!isAdmin && tenantId) {
      params.push(tenantId);
      tenantWhere = `AND tenant_id = $${params.length}`;
    }

    const product = await queryOne(
      `UPDATE products SET ${setClauses.join(', ')} WHERE id = $${idx} ${tenantWhere} RETURNING *`,
      params
    );

    if (!product) return reply.status(404).send({ error: 'Produto não encontrado' });
    return product;
  });

  // Delete product
  app.delete('/api/products/:productId', {
    preHandler: [authMiddleware, requireRole('admin', 'manager', 'seller')],
  }, async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const { tenantId, isAdmin } = getTenantFilter(request);

    const params: unknown[] = [productId];
    let tenantWhere = '';
    if (!isAdmin && tenantId) {
      params.push(tenantId);
      tenantWhere = `AND tenant_id = $${params.length}`;
    }

    const result = await query(
      `DELETE FROM products WHERE id = $1 ${tenantWhere}`,
      params
    );

    if (result.rowCount === 0) return reply.status(404).send({ error: 'Produto não encontrado' });
    return reply.send({ success: true });
  });

  // List categories
  app.get('/api/products/categories', {
    preHandler: [authMiddleware],
  }, async () => {
    return queryMany(`SELECT * FROM product_categories ORDER BY name`);
  });
}
