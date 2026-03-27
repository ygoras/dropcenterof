import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validateBody } from '../../middleware/validateBody.js';
import { queryMany, queryOne, query } from '../../lib/db.js';

const createPlanSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().min(0),
  max_listings: z.number().int().min(0).optional(),
  max_orders: z.number().int().min(0).optional(),
  features: z.record(z.unknown()).optional(),
  is_default: z.boolean().default(false),
});

export async function registerPlanRoutes(app: FastifyInstance) {
  // Public plans (for sellers)
  app.get('/api/plans', {
    preHandler: [authMiddleware],
  }, async () => {
    return queryMany(`SELECT * FROM plans WHERE is_active = true ORDER BY price ASC`);
  });

  // Admin plans (includes inactive)
  app.get('/api/admin/plans', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async () => {
    return queryMany(`SELECT * FROM plans ORDER BY price ASC`);
  });

  // Create plan (admin) — frontend sends slug, max_stores, features[], is_active
  app.post('/api/admin/plans', {
    preHandler: [authMiddleware, requireRole('admin')],
  }, async (request, reply) => {
    const body = request.body as {
      name: string; slug?: string; price: number; description?: string | null;
      max_listings?: number | null; max_stores?: number | null; max_products?: number | null;
      features?: unknown[]; is_active?: boolean;
    };

    if (!body.name || body.price === undefined) {
      return reply.status(400).send({ error: 'name e price são obrigatórios' });
    }

    const slug = body.slug || body.name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const plan = await queryOne(
      `INSERT INTO plans (name, slug, price, description, max_listings, max_stores, max_products, features, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [body.name, slug, body.price, body.description ?? null,
       body.max_listings ?? null, body.max_stores ?? 1, body.max_products ?? null,
       JSON.stringify(body.features ?? []), body.is_active !== false]
    );

    return reply.status(201).send(plan);
  });

  // Update plan (admin)
  app.patch('/api/admin/plans/:planId', {
    preHandler: [authMiddleware, requireRole('admin')],
  }, async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const body = request.body as Record<string, unknown>;

    const allowedFields = ['name', 'price', 'description', 'max_listings', 'max_stores', 'max_products', 'features', 'is_active'];
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && allowedFields.includes(key)) {
        setClauses.push(`${key} = $${idx}`);
        params.push(key === 'features' ? JSON.stringify(value) : value);
        idx++;
      }
    }

    if (setClauses.length === 0) return reply.status(400).send({ error: 'Nada para atualizar' });

    params.push(planId);
    const plan = await queryOne(
      `UPDATE plans SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (!plan) return reply.status(404).send({ error: 'Plano não encontrado' });
    return plan;
  });

  // Delete plan (admin)
  app.delete('/api/admin/plans/:planId', {
    preHandler: [authMiddleware, requireRole('admin')],
  }, async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const result = await query(`DELETE FROM plans WHERE id = $1`, [planId]);
    if (result.rowCount === 0) return reply.status(404).send({ error: 'Plano não encontrado' });
    return { success: true };
  });
}
