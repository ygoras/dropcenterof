import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validateBody } from '../../middleware/validateBody.js';
import { queryMany, queryOne, query } from '../../lib/db.js';

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  document: z.string().optional(),
  phone: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
});

export async function registerTenantRoutes(app: FastifyInstance) {
  app.get('/api/tenants', {
    preHandler: [authMiddleware, requireRole('admin', 'manager', 'operator')],
  }, async () => {
    return queryMany(
      `SELECT t.*,
              (SELECT COUNT(*) FROM profiles p WHERE p.tenant_id = t.id) as user_count,
              s.status as subscription_status, pl.name as plan_name
       FROM tenants t
       LEFT JOIN subscriptions s ON s.tenant_id = t.id
       LEFT JOIN plans pl ON pl.id = s.plan_id
       ORDER BY t.created_at DESC`
    );
  });

  app.get('/api/tenants/:tenantId', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const isAdmin = request.user.roles.includes('admin') || request.user.roles.includes('manager');

    if (!isAdmin && request.user.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Acesso negado' });
    }

    const tenant = await queryOne(`SELECT * FROM tenants WHERE id = $1`, [tenantId]);
    if (!tenant) return reply.status(404).send({ error: 'Tenant não encontrado' });
    return tenant;
  });

  app.patch('/api/tenants/:tenantId', {
    preHandler: [authMiddleware, validateBody(updateTenantSchema)],
  }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const body = request.body as z.infer<typeof updateTenantSchema>;
    const isAdmin = request.user.roles.includes('admin') || request.user.roles.includes('manager');

    if (!isAdmin && request.user.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Acesso negado' });
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) {
        setClauses.push(`${key} = $${idx}`);
        params.push(key === 'settings' ? JSON.stringify(value) : value);
        idx++;
      }
    }

    if (setClauses.length === 0) {
      return reply.status(400).send({ error: 'Nenhum campo para atualizar' });
    }

    params.push(tenantId);
    const tenant = await queryOne(
      `UPDATE tenants SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      params
    );

    if (!tenant) return reply.status(404).send({ error: 'Tenant não encontrado' });
    return tenant;
  });
}
