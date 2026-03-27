import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { queryMany, queryOne } from '../../lib/db.js';
import { getTenantFilter } from '../../middleware/tenantScope.js';

export async function registerWalletRoutes(app: FastifyInstance) {
  // Get wallet balance
  app.get('/api/wallet/balance', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { tenantId, isAdmin } = getTenantFilter(request);
    const targetTenantId = isAdmin
      ? (request.query as { tenantId?: string }).tenantId
      : tenantId;

    if (!targetTenantId) {
      return reply.status(400).send({ error: 'Tenant não especificado' });
    }

    const balance = await queryOne(
      `SELECT * FROM wallet_balances WHERE tenant_id = $1`,
      [targetTenantId]
    );

    return balance ?? { tenant_id: targetTenantId, balance: 0 };
  });

  // Get wallet transactions
  app.get('/api/wallet/transactions', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { tenantId, isAdmin } = getTenantFilter(request);
    const targetTenantId = isAdmin
      ? (request.query as { tenantId?: string }).tenantId ?? tenantId
      : tenantId;

    const { limit, offset } = request.query as { limit?: string; offset?: string };
    const limitVal = Math.min(parseInt(limit ?? '50'), 100);
    const offsetVal = parseInt(offset ?? '0');

    return queryMany(
      `SELECT * FROM wallet_transactions
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [targetTenantId, limitVal, offsetVal]
    );
  });

  // Admin: list all wallet balances
  app.get('/api/wallet/admin', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async () => {
    return queryMany(
      `SELECT wb.*, t.name as tenant_name
       FROM wallet_balances wb
       JOIN tenants t ON t.id = wb.tenant_id
       ORDER BY wb.balance DESC`
    );
  });
}
