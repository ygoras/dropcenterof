import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validateBody } from '../../middleware/validateBody.js';
import { queryMany, queryOne, query } from '../../lib/db.js';
import { getTenantFilter } from '../../middleware/tenantScope.js';
import { logger } from '../../lib/logger.js';

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

    return balance ?? { tenant_id: targetTenantId, balance: 0, special_credit: 0 };
  });

  // Admin: grant special credit to a seller
  app.post('/api/admin/wallet/grant-special-credit', {
    preHandler: [authMiddleware, requireRole('admin', 'manager'), validateBody(z.object({
      tenant_id: z.string().uuid(),
      amount: z.number().min(0.01),
      description: z.string().max(500).optional(),
    }))],
  }, async (request, reply) => {
    const body = request.body as { tenant_id: string; amount: number; description?: string };
    const adminUserId = request.user.sub;

    // Atomically increment special_credit and record the transaction
    const updated = await queryOne<{ tenant_id: string; balance: number; special_credit: number }>(
      `INSERT INTO wallet_balances (tenant_id, balance, special_credit)
       VALUES ($1, 0, $2)
       ON CONFLICT (tenant_id)
       DO UPDATE SET special_credit = wallet_balances.special_credit + $2, updated_at = now()
       RETURNING tenant_id, balance, special_credit`,
      [body.tenant_id, body.amount]
    );

    if (!updated) {
      return reply.status(500).send({ error: 'Falha ao conceder crédito especial' });
    }

    // Insert deposit transaction marked as special_credit_grant
    await query(
      `INSERT INTO wallet_transactions (
        tenant_id, type, amount, balance_after, status, description,
        reference_type, confirmed_at, metadata
      ) VALUES ($1, 'deposit', $2, $3, 'confirmed', $4, 'special_credit_grant', now(), $5)`,
      [
        body.tenant_id,
        body.amount,
        updated.balance, // regular balance unchanged
        body.description ?? `Crédito especial concedido pelo admin`,
        JSON.stringify({ granted_by: adminUserId, special_credit_after: updated.special_credit }),
      ]
    );

    // Audit log (non-blocking)
    try {
      await query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, 'special_credit_granted', 'tenant', $2, $3)`,
        [adminUserId, body.tenant_id, JSON.stringify({ amount: body.amount, description: body.description })]
      );
    } catch (err) {
      logger.warn({ err }, 'Audit log insert failed');
    }

    return reply.send({
      success: true,
      tenant_id: body.tenant_id,
      balance: Number(updated.balance),
      special_credit: Number(updated.special_credit),
    });
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
