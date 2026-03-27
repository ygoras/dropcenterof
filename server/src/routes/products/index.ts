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
  description: z.string().nullable().optional(),
  cost_price: z.number().min(0).optional(),
  sale_price: z.number().min(0).optional(),
  sell_price: z.number().min(0).optional(),
  category_id: z.string().nullable().optional(),
  images: z.array(z.string()).optional(),
  weight: z.number().min(0).optional(),
  weight_kg: z.number().min(0).nullable().optional(),
  width: z.number().min(0).optional(),
  height: z.number().min(0).optional(),
  length: z.number().min(0).optional(),
  dimensions: z.object({ length: z.number(), width: z.number(), height: z.number() }).nullable().optional(),
  status: z.enum(['active', 'inactive', 'draft']).default('active'),
  brand: z.string().nullable().optional(),
  ml_category_id: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  gtin: z.string().nullable().optional(),
  warranty_type: z.string().nullable().optional(),
  warranty_time: z.string().nullable().optional(),
  initial_stock: z.number().min(0).optional(),
  min_stock: z.number().min(0).optional(),
  ml_listing_quantity: z.number().min(0).optional(),
}).passthrough();

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
    const body = request.body as Record<string, any>;
    const tenantId = request.user.tenantId;

    // Map frontend field names to DB columns
    const sellPrice = body.sale_price ?? body.sell_price ?? 0;
    const weightKg = body.weight ?? body.weight_kg ?? null;
    const dims = body.dimensions ?? (body.width || body.height || body.length
      ? { length: body.length ?? 0, width: body.width ?? 0, height: body.height ?? 0 }
      : null);
    const mlCategoryId = body.ml_category_id ?? null;
    const attributes = body.attributes ?? {};
    // Store warranty and ML attributes
    if (body.warranty_type) attributes._warranty_type = body.warranty_type;
    if (body.warranty_time) attributes._warranty_time = body.warranty_time;

    const product = await queryOne(
      `INSERT INTO products (name, sku, description, cost_price, sell_price, category, images, weight_kg, dimensions, status, tenant_id, brand, ml_category_id, attributes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [body.name, body.sku ?? `SKU-${Date.now()}`, body.description ?? null, body.cost_price ?? 0, sellPrice,
       body.category_id ?? null, JSON.stringify(body.images ?? []), weightKg,
       dims ? JSON.stringify(dims) : null, body.status ?? 'active', tenantId,
       body.brand ?? null, mlCategoryId, JSON.stringify(attributes)]
    );

    if (!product) return reply.status(500).send({ error: 'Falha ao criar produto' });

    // Create initial stock if provided
    const initialStock = body.initial_stock ?? 0;
    const minStock = body.min_stock ?? 5;
    if (product) {
      await query(
        `INSERT INTO stock (product_id, quantity, reserved, min_stock, tenant_id)
         VALUES ($1, $2, 0, $3, $4)
         ON CONFLICT (product_id) DO UPDATE SET quantity = $2, min_stock = $3`,
        [product.id, initialStock, minStock, tenantId]
      );
    }

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
