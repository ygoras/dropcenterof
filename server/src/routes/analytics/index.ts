import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { queryOne, queryMany } from '../../lib/db.js';
import { getTenantFilter } from '../../middleware/tenantScope.js';

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  // Dashboard stats
  app.get('/api/analytics/dashboard', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { tenantId, isAdmin } = getTenantFilter(request);
    const tenantCondition = !isAdmin && tenantId ? `WHERE tenant_id = '${tenantId}'` : '';

    const [orders, revenue, products, listings] = await Promise.all([
      queryOne(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'pending') as pending FROM orders ${tenantCondition}`),
      queryOne(`SELECT COALESCE(SUM(total_amount), 0) as total FROM orders ${tenantCondition} WHERE created_at >= DATE_TRUNC('month', NOW())`),
      queryOne(`SELECT COUNT(*) as total FROM products ${tenantCondition}`),
      queryOne(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM ml_listings ${tenantCondition}`),
    ]);

    return { orders, revenue, products, listings };
  });

  // Admin overview
  app.get('/api/analytics/admin', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async () => {
    const [sellers, orders, revenue, subscriptions] = await Promise.all([
      queryOne(`SELECT COUNT(*) as total FROM tenants`),
      queryOne(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', NOW())) as this_month FROM orders`),
      queryOne(`SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE created_at >= DATE_TRUNC('month', NOW())`),
      queryOne(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM subscriptions`),
    ]);

    return { sellers, orders, revenue, subscriptions };
  });
}
