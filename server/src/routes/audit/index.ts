import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { queryMany, queryOne, query } from '../../lib/db.js';

export async function registerAuditRoutes(app: FastifyInstance) {
  app.get('/api/audit', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async (request) => {
    const { limit, offset, entity_type, action } = request.query as {
      limit?: string; offset?: string; entity_type?: string; action?: string;
    };

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (entity_type) { params.push(entity_type); conditions.push(`al.entity_type = $${params.length}`); }
    if (action) { params.push(action); conditions.push(`al.action = $${params.length}`); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitVal = Math.min(parseInt(limit ?? '20'), 200);
    const offsetVal = parseInt(offset ?? '0');

    // Count + data in parallel
    const countParams = [...params];
    params.push(limitVal, offsetVal);

    const [data, countRow] = await Promise.all([
      queryMany(
        `SELECT al.*, p.name as user_name
         FROM audit_logs al
         LEFT JOIN profiles p ON p.id = al.user_id
         ${whereClause}
         ORDER BY al.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      queryOne<{ total: string }>(
        `SELECT COUNT(*) as total FROM audit_logs al ${whereClause}`,
        countParams
      ),
    ]);

    return { data, total: parseInt(countRow?.total ?? '0') };
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
