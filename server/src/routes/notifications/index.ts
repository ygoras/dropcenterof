import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware/auth.js';
import { queryMany, query } from '../../lib/db.js';

export async function registerNotificationRoutes(app: FastifyInstance) {
  // List notifications
  app.get('/api/notifications', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const tenantId = request.user.tenantId;
    const query_params = request.query as { limit?: string; offset?: string };
    const limit = Math.min(parseInt(query_params.limit || '50', 10) || 50, 200);
    const offset = parseInt(query_params.offset || '0', 10) || 0;

    return queryMany(
      `SELECT * FROM notifications
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    );
  });

  // Mark as read
  app.patch('/api/notifications/:notificationId/read', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { notificationId } = request.params as { notificationId: string };
    const tenantId = request.user.tenantId;

    await query(
      `UPDATE notifications SET read = true WHERE id = $1 AND tenant_id = $2`,
      [notificationId, tenantId]
    );

    return { success: true };
  });

  // Mark all as read
  app.patch('/api/notifications/read-all', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const tenantId = request.user.tenantId;

    await query(
      `UPDATE notifications SET read = true WHERE tenant_id = $1 AND read = false`,
      [tenantId]
    );

    return { success: true };
  });
}
