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

  // Admin: list all wallet balances (simple)
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

  // Admin: full wallet overview with summary
  app.get('/api/admin/wallets', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async () => {
    const sellers = await queryMany(
      `SELECT
         wb.tenant_id,
         t.name as tenant_name,
         p.name as seller_name,
         p.email as seller_email,
         COALESCE(wb.balance, 0) as balance,
         COALESCE((SELECT SUM(amount) FROM wallet_transactions wt WHERE wt.tenant_id = wb.tenant_id AND wt.type = 'deposit' AND wt.status = 'confirmed'), 0) as total_deposits,
         COALESCE((SELECT SUM(amount) FROM wallet_transactions wt WHERE wt.tenant_id = wb.tenant_id AND wt.type = 'debit' AND wt.status = 'confirmed'), 0) as total_debits,
         (SELECT MAX(created_at) FROM wallet_transactions wt WHERE wt.tenant_id = wb.tenant_id) as last_transaction_at
       FROM wallet_balances wb
       JOIN tenants t ON t.id = wb.tenant_id
       LEFT JOIN profiles p ON p.tenant_id = wb.tenant_id
       LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'seller'
       ORDER BY wb.balance DESC`
    );

    const totalBalance = sellers.reduce((sum: number, s: any) => sum + Number(s.balance), 0);
    const totalSellers = sellers.length;
    const totalDeposits = sellers.reduce((sum: number, s: any) => sum + Number(s.total_deposits), 0);
    const totalDebits = sellers.reduce((sum: number, s: any) => sum + Number(s.total_debits), 0);

    return {
      sellers,
      summary: {
        total_balance: totalBalance,
        total_sellers: totalSellers,
        total_deposits_all: totalDeposits,
        total_debits_all: totalDebits,
        avg_balance_per_seller: totalSellers > 0 ? totalBalance / totalSellers : 0,
        avg_spend_per_seller: totalSellers > 0 ? totalDebits / totalSellers : 0,
        sellers_with_zero: sellers.filter((s: any) => Number(s.balance) === 0).length,
        sellers_with_low: sellers.filter((s: any) => Number(s.balance) > 0 && Number(s.balance) < 50).length,
      },
    };
  });
}
