import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware/auth.js';
import { query, queryOne, queryMany } from '../../lib/db.js';

export async function registerMlCrudRoutes(app: FastifyInstance) {
  // ─── ML CREDENTIALS ──────────────────────────────────────

  // List credentials for current tenant
  app.get('/api/ml/credentials', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const credentials = await queryMany(
      `SELECT id, tenant_id, ml_user_id, ml_nickname, store_name, expires_at, created_at, updated_at
       FROM ml_credentials
       WHERE tenant_id = $1
       ORDER BY created_at`,
      [request.user.tenantId]
    );
    return credentials;
  });

  // Update credential (store_name)
  app.patch('/api/ml/credentials/:id', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { store_name } = request.body as { store_name?: string };

    const cred = await queryOne<{ tenant_id: string }>(
      `SELECT tenant_id FROM ml_credentials WHERE id = $1`,
      [id]
    );

    if (!cred || cred.tenant_id !== request.user.tenantId) {
      return reply.status(404).send({ error: 'Credencial não encontrada' });
    }

    await query(
      `UPDATE ml_credentials SET store_name = $1, updated_at = NOW() WHERE id = $2`,
      [store_name, id]
    );

    return { success: true };
  });

  // ─── ML LISTINGS ──────────────────────────────────────────

  // List listings for current tenant (with product join)
  app.get('/api/ml/listings', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const query_params = request.query as { limit?: string; offset?: string };
    const limit = Math.min(parseInt(query_params.limit || '50', 10) || 50, 200);
    const offset = parseInt(query_params.offset || '0', 10) || 0;

    const listings = await queryMany(
      `SELECT ml.*,
              p.name AS product_name, p.sku AS product_sku, p.images AS product_images,
              COALESCE(mc.store_name, mc.ml_nickname, '—') AS store_name
       FROM ml_listings ml
       LEFT JOIN products p ON p.id = ml.product_id
       LEFT JOIN ml_credentials mc ON mc.id = ml.ml_credential_id
       WHERE ml.tenant_id = $1
       ORDER BY ml.created_at DESC
       LIMIT $2 OFFSET $3`,
      [request.user.tenantId, limit, offset]
    );
    return listings;
  });

  // Create listing
  app.post('/api/ml/listings', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const body = request.body as {
      product_id: string;
      title: string;
      price: number;
      category_id?: string;
      attributes?: Record<string, unknown>;
      ml_credential_id?: string;
    };

    const result = await queryOne<{ id: string }>(
      `INSERT INTO ml_listings (product_id, tenant_id, title, price, category_id, attributes, ml_credential_id, status, sync_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', 'pending')
       RETURNING id`,
      [
        body.product_id,
        request.user.tenantId,
        body.title,
        body.price,
        body.category_id ?? null,
        JSON.stringify(body.attributes ?? {}),
        body.ml_credential_id ?? null,
      ]
    );

    if (!result) {
      return reply.status(500).send({ error: 'Erro ao criar anúncio' });
    }

    return { id: result.id, success: true };
  });

  // Update listing
  app.patch('/api/ml/listings/:id', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const listing = await queryOne<{ tenant_id: string }>(
      `SELECT tenant_id FROM ml_listings WHERE id = $1`,
      [id]
    );

    if (!listing || listing.tenant_id !== request.user.tenantId) {
      return reply.status(404).send({ error: 'Anúncio não encontrado' });
    }

    // Build dynamic update
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const allowedFields = ['title', 'price', 'category_id', 'attributes', 'status', 'sync_status', 'ml_credential_id'];
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        fields.push(`${field} = $${idx}`);
        values.push(field === 'attributes' ? JSON.stringify(body[field]) : body[field]);
        idx++;
      }
    }

    if (fields.length === 0) {
      return reply.status(400).send({ error: 'Nenhum campo para atualizar' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    await query(
      `UPDATE ml_listings SET ${fields.join(', ')} WHERE id = $${idx}`,
      values
    );

    return { success: true };
  });
}
