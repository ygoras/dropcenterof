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
  app.get('/api/plans', {
    preHandler: [authMiddleware],
  }, async () => {
    return queryMany(`SELECT * FROM plans ORDER BY price ASC`);
  });

  app.post('/api/plans', {
    preHandler: [authMiddleware, requireRole('admin'), validateBody(createPlanSchema)],
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof createPlanSchema>;

    const plan = await queryOne(
      `INSERT INTO plans (name, description, price, max_listings, max_orders, features, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [body.name, body.description, body.price, body.max_listings, body.max_orders,
       JSON.stringify(body.features ?? {}), body.is_default]
    );

    return reply.status(201).send(plan);
  });

  app.patch('/api/plans/:planId', {
    preHandler: [authMiddleware, requireRole('admin'), validateBody(createPlanSchema.partial())],
  }, async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const body = request.body as Partial<z.infer<typeof createPlanSchema>>;

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) {
        setClauses.push(`${key} = $${idx}`);
        params.push(key === 'features' ? JSON.stringify(value) : value);
        idx++;
      }
    }

    if (setClauses.length === 0) return reply.status(400).send({ error: 'Nada para atualizar' });

    params.push(planId);
    const plan = await queryOne(
      `UPDATE plans SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      params
    );

    if (!plan) return reply.status(404).send({ error: 'Plano não encontrado' });
    return plan;
  });

  app.delete('/api/plans/:planId', {
    preHandler: [authMiddleware, requireRole('admin')],
  }, async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const result = await query(`DELETE FROM plans WHERE id = $1`, [planId]);
    if (result.rowCount === 0) return reply.status(404).send({ error: 'Plano não encontrado' });
    return { success: true };
  });
}
