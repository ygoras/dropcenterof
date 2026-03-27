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
  cost_price: z.number().min(0.01, 'Custo é obrigatório'),
  sale_price: z.number().min(0.01).optional(),
  sell_price: z.number().min(0.01).optional(),
  category_id: z.string().nullable().optional(),
  images: z.array(z.string()).min(3, 'Mínimo 3 imagens obrigatórias'),
  weight: z.number().min(0.01, 'Peso é obrigatório').optional(),
  weight_kg: z.number().min(0.01).nullable().optional(),
  width: z.number().min(0.01).optional(),
  height: z.number().min(0.01).optional(),
  length: z.number().min(0.01).optional(),
  dimensions: z.object({ length: z.number(), width: z.number(), height: z.number() }).nullable().optional(),
  status: z.enum(['active', 'inactive', 'draft']).default('active'),
  brand: z.string().nullable().optional(),
  ml_category_id: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  gtin: z.string().nullable().optional(),
  warranty_type: z.string().min(1, 'Tipo de garantia é obrigatório'),
  warranty_time: z.string().min(1, 'Tempo de garantia é obrigatório'),
  initial_stock: z.number().min(0, 'Estoque inicial é obrigatório'),
  min_stock: z.number().min(0).optional(),
  ml_listing_quantity: z.number().min(0).optional(),
}).passthrough().refine(data => {
  // Require sell_price or sale_price
  return (data.sell_price && data.sell_price > 0) || (data.sale_price && data.sale_price > 0);
}, { message: 'Preço de venda é obrigatório', path: ['sell_price'] }).refine(data => {
  // Require weight or weight_kg
  return (data.weight && data.weight > 0) || (data.weight_kg && data.weight_kg > 0);
}, { message: 'Peso é obrigatório', path: ['weight'] }).refine(data => {
  // Require dimensions
  const hasDims = data.dimensions && data.dimensions.length > 0 && data.dimensions.width > 0 && data.dimensions.height > 0;
  const hasIndividual = (data.width && data.width > 0) && (data.height && data.height > 0) && (data.length && data.length > 0);
  return hasDims || hasIndividual;
}, { message: 'Dimensões (comprimento, largura, altura) são obrigatórias', path: ['dimensions'] });

// Update schema is fully partial - all fields optional
const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
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
  status: z.enum(['active', 'inactive', 'draft']).optional(),
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
      // Seller sees own products + master catalog (tenant_id IS NULL)
      whereClause = `WHERE (p.tenant_id = $${params.length} OR p.tenant_id IS NULL)`;
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
      // Seller sees own products + master catalog (tenant_id IS NULL)
      tenantWhere = `AND (p.tenant_id = $${params.length} OR p.tenant_id IS NULL)`;
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
    const body = request.body as Record<string, any>;
    const { tenantId, isAdmin } = getTenantFilter(request);

    // Fields that map to different DB column names
    const fieldMap: Record<string, string> = {
      sale_price: 'sell_price',
      weight: 'weight_kg',
    };
    // Fields that need JSON.stringify
    const jsonFields = new Set(['images', 'dimensions', 'attributes']);
    // Fields that are NOT columns in the products table
    const skipFields = new Set(['initial_stock', 'min_stock', 'ml_listing_quantity', 'warranty_type', 'warranty_time']);

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // Build attributes JSONB merge for warranty fields
    let attributesMerge: Record<string, any> | null = null;
    if (body.warranty_type !== undefined || body.warranty_time !== undefined) {
      attributesMerge = {};
      if (body.warranty_type !== undefined) attributesMerge._warranty_type = body.warranty_type;
      if (body.warranty_time !== undefined) attributesMerge._warranty_time = body.warranty_time;
    }

    // If body has explicit attributes, merge warranty into it
    if (body.attributes && attributesMerge) {
      Object.assign(body.attributes, attributesMerge);
      attributesMerge = null; // already merged
    }

    for (const [key, value] of Object.entries(body)) {
      if (value === undefined || skipFields.has(key)) continue;

      const dbKey = fieldMap[key] || key;
      setClauses.push(`${dbKey} = $${idx}`);

      if (jsonFields.has(key)) {
        params.push(JSON.stringify(value));
      } else if (key === 'width' || key === 'height' || key === 'length') {
        // Build dimensions from individual fields — handled below
        continue;
      } else {
        params.push(value);
      }
      idx++;
    }

    // Handle individual dimension fields → dimensions JSONB column
    if (body.width !== undefined || body.height !== undefined || body.length !== undefined) {
      const dims = {
        length: body.length ?? 0,
        width: body.width ?? 0,
        height: body.height ?? 0,
      };
      // Remove individual field clauses (they were skipped via continue above)
      setClauses.push(`dimensions = $${idx}`);
      params.push(JSON.stringify(dims));
      idx++;
    }

    // Merge warranty attributes if not already done via body.attributes
    if (attributesMerge) {
      setClauses.push(`attributes = attributes || $${idx}::jsonb`);
      params.push(JSON.stringify(attributesMerge));
      idx++;
    }

    if (setClauses.length === 0) {
      return reply.status(400).send({ error: 'Nenhum campo para atualizar' });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(productId);
    let tenantWhere = '';
    if (!isAdmin && tenantId) {
      params.push(tenantId);
      tenantWhere = `AND (tenant_id = $${params.length} OR tenant_id IS NULL)`;
    }

    const product = await queryOne(
      `UPDATE products SET ${setClauses.join(', ')} WHERE id = $${idx} ${tenantWhere} RETURNING *`,
      params
    );

    if (!product) return reply.status(404).send({ error: 'Produto não encontrado' });

    // Update stock if initial_stock or min_stock provided
    if (body.initial_stock !== undefined || body.min_stock !== undefined) {
      const stockUpdates: string[] = [];
      const stockParams: unknown[] = [];
      let si = 1;
      if (body.initial_stock !== undefined) {
        stockUpdates.push(`quantity = $${si}`);
        stockParams.push(body.initial_stock);
        si++;
      }
      if (body.min_stock !== undefined) {
        stockUpdates.push(`min_stock = $${si}`);
        stockParams.push(body.min_stock);
        si++;
      }
      stockParams.push(productId);
      await query(
        `UPDATE stock SET ${stockUpdates.join(', ')}, updated_at = NOW() WHERE product_id = $${si}`,
        stockParams
      );
    }

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
