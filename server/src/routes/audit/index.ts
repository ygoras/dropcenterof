import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { queryMany, query } from '../../lib/db.js';

export async function registerAuditRoutes(app: FastifyInstance) {
  app.get('/api/audit', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async (request) => {
    const { limit, offset, entity_type, action } = request.query as {
      limit?: string; offset?: string; entity_type?: string; action?: string;
    };

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (entity_type) { params.push(entity_type); conditions.push(`entity_type = $${params.length}`); }
    if (action) { params.push(action); conditions.push(`action = $${params.length}`); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitVal = Math.min(parseInt(limit ?? '50'), 200);
    const offsetVal = parseInt(offset ?? '0');

    params.push(limitVal, offsetVal);

    return queryMany(
      `SELECT al.*, p.name as user_name
       FROM audit_logs al
       LEFT JOIN profiles p ON p.id = al.user_id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
  });

  app.post('/api/audit', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { action, entity_type, entity_id, details } = request.body as {
      action: string; entity_type: string; entity_id?: string; details?: Record<string, unknown>;
    };

    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [request.user.sub, action, entity_type, entity_id, JSON.stringify(details ?? {})]
    );

    return reply.status(201).send({ success: true });
  });
}
