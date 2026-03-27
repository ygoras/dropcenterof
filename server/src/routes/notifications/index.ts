import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware/auth.js';
import { queryMany, query } from '../../lib/db.js';
import { getTenantFilter } from '../../middleware/tenantScope.js';

export async function registerNotificationRoutes(app: FastifyInstance) {
  // List notifications
  app.get('/api/notifications', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const userId = request.user.sub;

    return queryMany(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );
  });

  // Mark as read
  app.patch('/api/notifications/:notificationId/read', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { notificationId } = request.params as { notificationId: string };
    const userId = request.user.sub;

    await query(
      `UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2`,
      [notificationId, userId]
    );

    return { success: true };
  });

  // Mark all as read
  app.patch('/api/notifications/read-all', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const userId = request.user.sub;

    await query(
      `UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`,
      [userId]
    );

    return { success: true };
  });
}
