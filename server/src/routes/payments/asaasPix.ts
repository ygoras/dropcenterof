import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { query, queryOne, queryMany } from '../../lib/db.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { encrypt, decrypt } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';

const ASAAS_API = env.ASAAS_SANDBOX
  ? 'https://sandbox.asaas.com/api/v3'
  : 'https://api.asaas.com/v3';

// ─── Helper: get or create Asaas customer ──────────────────────────

async function getOrCreateAsaasCustomer(
  tenantId: string,
  tenantName: string,
  email: string,
  document?: string
): Promise<string> {
  const tenant = await queryOne<{
    id: string;
    name: string;
    document: string | null;
    settings: Record<string, unknown> | null;
  }>(
    'SELECT id, name, document, settings FROM tenants WHERE id = $1',
    [tenantId]
  );

  // Decrypt document from DB (stored encrypted)
  let tenantDoc = tenant?.document || document || '';
  if (tenantDoc) {
    try { tenantDoc = decrypt(tenantDoc); } catch { /* not encrypted or plain text */ }
  }
  const cpfCnpj = tenantDoc?.replace(/\D/g, '') || undefined;
  let asaasCustomerId = (tenant?.settings as Record<string, unknown>)?.asaas_customer_id as string | undefined;

  if (!asaasCustomerId) {
    // Create new customer in Asaas
    const customerRes = await fetch(`${ASAAS_API}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: env.ASAAS_API_KEY },
      body: JSON.stringify({
        name: tenant?.name || tenantName,
        email,
        cpfCnpj,
        externalReference: tenantId,
      }),
    });

    if (!customerRes.ok) {
      const errText = await customerRes.text();
      throw new Error(`Erro ao criar cliente no Asaas: ${errText}`);
    }

    const customerData: any = await customerRes.json();
    asaasCustomerId = customerData.id as string;

    const updatedSettings = { ...(tenant?.settings || {}), asaas_customer_id: asaasCustomerId };
    await query(
      'UPDATE tenants SET settings = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updatedSettings), tenantId]
    );
  } else if (cpfCnpj) {
    // Customer exists — update cpfCnpj if we have it (may have been created without)
    try {
      await fetch(`${ASAAS_API}/customers/${asaasCustomerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', access_token: env.ASAAS_API_KEY },
        body: JSON.stringify({ cpfCnpj }),
      });
    } catch {
      // Non-blocking — customer update failure shouldn't prevent PIX generation
    }
  }

  return asaasCustomerId;
}

// ─── Route registration ────────────────────────────────────────────

const pixActionSchema = z.object({
  action: z.enum([
    'generate_pix', 'generate_plan_charge', 'get_balance', 'get_transactions',
    'get_spending_forecast', 'check_charge_status', 'cleanup_duplicates',
    'sync_pending_charges', 'cancel_charge', 'reopen_pix',
  ]),
  amount: z.number().min(1).max(50000).optional(),
  tenant_id: z.string().uuid().optional(),
  subscription_id: z.string().uuid().optional(),
  reference_id: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

type PixActionBody = z.infer<typeof pixActionSchema>;

export async function registerAsaasPixRoutes(app: FastifyInstance) {
  app.post('/api/payments/pix', {
    preHandler: [authMiddleware],
    config: { rateLimit: { max: 10, timeWindow: '1 minute', keyGenerator: (req: FastifyRequest) => req.user?.sub || req.ip } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = pixActionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors });
    }

    const body = parsed.data;
    const { action } = body;
    const user = request.user;

    if (!user.tenantId) {
      return reply.status(400).send({ error: 'Perfil não encontrado' });
    }

    // ─── ACTION: generate_pix (wallet recharge) ──────────────────

    if (action === 'generate_pix') {
      const { amount } = body;

      if (!amount || !Number.isFinite(amount) || amount < 1 || amount > 50000 || !Number.isInteger(Math.round(amount * 100))) {
        return reply.status(400).send({ error: 'Valor inválido. Mínimo R$ 1,00, máximo R$ 50.000,00.' });
      }

      // Check if tenant has CPF/CNPJ (required by Asaas for PIX)
      const tenantCheck = await queryOne<{ document: string | null }>(
        'SELECT document FROM tenants WHERE id = $1',
        [user.tenantId]
      );

      let docValue = tenantCheck?.document || '';
      if (docValue) {
        try { docValue = decrypt(docValue); } catch { /* plain text */ }
      }
      if (!docValue?.replace(/\D/g, '')) {
        return reply.status(400).send({
          error: 'CPF ou CNPJ não cadastrado. Acesse Configurações e preencha seu CPF ou CNPJ antes de recarregar.',
          code: 'MISSING_DOCUMENT',
        });
      }

      const tenant = await queryOne<{
        id: string; name: string; document: string | null; settings: Record<string, unknown> | null;
      }>(
        'SELECT id, name, document, settings FROM tenants WHERE id = $1',
        [user.tenantId]
      );

      const asaasCustomerId = await getOrCreateAsaasCustomer(
        user.tenantId,
        tenant?.name || user.email,
        user.email,
        tenant?.document ?? undefined
      );

      // Create PIX charge in Asaas
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1);

      const chargeRes = await fetch(`${ASAAS_API}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', access_token: env.ASAAS_API_KEY },
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: 'PIX',
          value: amount,
          dueDate: dueDate.toISOString().split('T')[0],
          description: `Recarga de créditos - ${tenant?.name || 'Vendedor'}`,
          externalReference: `wallet:${user.tenantId}`,
        }),
      });

      if (!chargeRes.ok) {
        const errText = await chargeRes.text();
        logger.error({ tenantId: user.tenantId, status: chargeRes.status, asaasError: errText, asaasCustomerId }, 'Asaas charge creation failed');
        return reply.status(400).send({ error: 'Erro ao criar cobrança PIX', details: errText });
      }

      const chargeData: any = await chargeRes.json();

      // Get PIX QR Code
      const pixRes = await fetch(`${ASAAS_API}/payments/${chargeData.id}/pixQrCode`, {
        headers: { access_token: env.ASAAS_API_KEY },
      });

      let pixData: { encodedImage: string | null; payload: string | null; expirationDate: string | null } = {
        encodedImage: null,
        payload: null,
        expirationDate: null,
      };
      if (pixRes.ok) {
        pixData = await pixRes.json() as any;
      }

      // Encrypt PIX code before storing
      const encryptedPixCode = pixData.payload ? encrypt(pixData.payload) : null;
      const encryptedPixImage = pixData.encodedImage ? encrypt(pixData.encodedImage) : null;

      // Record pending transaction
      await query(
        `INSERT INTO wallet_transactions
         (tenant_id, type, amount, status, description, reference_id, reference_type, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          user.tenantId,
          'deposit',
          amount,
          'pending',
          `Recarga PIX - R$ ${amount.toFixed(2)}`,
          chargeData.id,
          'asaas_pix',
          JSON.stringify({
            asaas_payment_id: chargeData.id,
            pix_code: encryptedPixCode,
            pix_qr_image: encryptedPixImage,
            due_date: dueDate.toISOString(),
          }),
        ]
      );

      return reply.send({
        success: true,
        payment_id: chargeData.id,
        reference_id: chargeData.id,
        pix_code: pixData.payload,
        pix_qr_image: pixData.encodedImage,
        pix_expiration: pixData.expirationDate,
        amount,
        status: chargeData.status,
      });
    }

    // ─── ACTION: generate_plan_charge ────────────────────────────

    if (action === 'generate_plan_charge') {
      // Require admin or manager role
      const isAdmin = user.roles.some((r: string) => r === 'admin' || r === 'manager');
      if (!isAdmin) {
        return reply.status(403).send({ error: 'Sem permissão' });
      }

      const { tenant_id, subscription_id } = body;

      if (!tenant_id || !subscription_id) {
        return reply.status(400).send({ error: 'tenant_id e subscription_id são obrigatórios' });
      }

      // Get subscription + plan details
      const subscription = await queryOne<{
        id: string; tenant_id: string; plan_id: string; status: string; billing_day: number;
      }>(
        'SELECT id, tenant_id, plan_id, status, billing_day FROM subscriptions WHERE id = $1',
        [subscription_id]
      );

      if (!subscription) {
        return reply.status(404).send({ error: 'Assinatura não encontrada' });
      }

      const plan = await queryOne<{ id: string; name: string; price: number }>(
        'SELECT id, name, price FROM plans WHERE id = $1',
        [subscription.plan_id]
      );

      if (!plan) {
        return reply.status(404).send({ error: 'Plano não encontrado' });
      }

      // Get tenant + seller profile for Asaas customer
      const tenant = await queryOne<{
        id: string; name: string; document: string | null; settings: Record<string, unknown> | null;
      }>(
        'SELECT id, name, document, settings FROM tenants WHERE id = $1',
        [tenant_id]
      );

      const sellerProfile = await queryOne<{ name: string; email: string }>(
        'SELECT name, email FROM profiles WHERE tenant_id = $1 LIMIT 1',
        [tenant_id]
      );

      const asaasCustomerId = await getOrCreateAsaasCustomer(
        tenant_id,
        tenant?.name || 'Vendedor',
        sellerProfile?.email || '',
        tenant?.document ?? undefined
      );

      // Calculate due date based on billing_day
      const now = new Date();
      let dueDate = new Date(now.getFullYear(), now.getMonth(), subscription.billing_day || 10);
      if (dueDate <= now) {
        dueDate.setMonth(dueDate.getMonth() + 1);
      }

      // Create PIX charge in Asaas
      const chargeRes = await fetch(`${ASAAS_API}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', access_token: env.ASAAS_API_KEY },
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: 'PIX',
          value: plan.price,
          dueDate: dueDate.toISOString().split('T')[0],
          description: `Plano ${plan.name} - ${tenant?.name || 'Vendedor'}`,
          externalReference: `plan:${tenant_id}:${subscription_id}`,
        }),
      });

      if (!chargeRes.ok) {
        const errText = await chargeRes.text();
        logger.error({ tenantId: tenant_id }, 'Asaas plan charge creation failed');
        return reply.status(400).send({ error: 'Erro ao criar cobrança', details: errText });
      }

      const chargeData: any = await chargeRes.json();

      // Get PIX QR Code
      const pixRes = await fetch(`${ASAAS_API}/payments/${chargeData.id}/pixQrCode`, {
        headers: { access_token: env.ASAAS_API_KEY },
      });

      let pixData: { encodedImage: string | null; payload: string | null; expirationDate: string | null } = {
        encodedImage: null,
        payload: null,
        expirationDate: null,
      };
      if (pixRes.ok) {
        pixData = await pixRes.json() as any;
      }

      // Encrypt PIX data before storing
      const encryptedPixCode = pixData.payload ? encrypt(pixData.payload) : null;
      const encryptedPixQrUrl = pixData.encodedImage
        ? encrypt(`data:image/png;base64,${pixData.encodedImage}`)
        : null;

      // Create payment record
      await query(
        `INSERT INTO payments
         (subscription_id, tenant_id, amount, due_date, status, pix_code, pix_qr_url, payment_gateway_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          subscription_id,
          tenant_id,
          plan.price,
          dueDate.toISOString().split('T')[0],
          'pending',
          encryptedPixCode,
          encryptedPixQrUrl,
          chargeData.id,
        ]
      );

      // Notify seller
      try {
        await query(
          'SELECT create_notification($1, $2, $3, $4, $5, $6)',
          [
            tenant_id,
            'plan_charge',
            `Cobrança do Plano ${plan.name}`,
            `Uma cobrança PIX de R$ ${plan.price.toFixed(2)} foi gerada. Vencimento: ${dueDate.toLocaleDateString('pt-BR')}.`,
            '/seller/credito',
            JSON.stringify({ plan_name: plan.name, amount: plan.price, asaas_id: chargeData.id }),
          ]
        );
      } catch (notifErr) {
        logger.warn(notifErr, 'Failed to create plan charge notification');
      }

      return reply.send({
        success: true,
        payment_id: chargeData.id,
        pix_code: pixData.payload,
        pix_qr_image: pixData.encodedImage,
        amount: plan.price,
        due_date: dueDate.toISOString().split('T')[0],
      });
    }

    // ─── ACTION: get_balance ─────────────────────────────────────

    if (action === 'get_balance') {
      const wallet = await queryOne<{ balance: number; updated_at: string }>(
        'SELECT balance, updated_at FROM wallet_balances WHERE tenant_id = $1',
        [user.tenantId]
      );

      return reply.send({
        balance: wallet?.balance ?? 0,
        updated_at: wallet?.updated_at ?? null,
      });
    }

    // ─── ACTION: get_transactions ────────────────────────────────

    if (action === 'get_transactions') {
      const limit = Math.min(body.limit ?? 50, 100);

      const transactions = await queryMany(
        `SELECT id, tenant_id, type, amount, balance_after, status, description,
                reference_id, reference_type, created_at, confirmed_at
         FROM wallet_transactions
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [user.tenantId, limit]
      );

      return reply.send({ transactions });
    }

    // ─── ACTION: get_spending_forecast ───────────────────────────

    if (action === 'get_spending_forecast') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentOrders = await queryMany<{ items: unknown[]; created_at: string }>(
        `SELECT items, created_at FROM orders
         WHERE tenant_id = $1
           AND status NOT IN ('cancelled', 'returned')
           AND created_at >= $2
         ORDER BY created_at DESC`,
        [user.tenantId, thirtyDaysAgo.toISOString()]
      );

      const products = await queryMany<{ id: string; cost_price: number; name: string }>(
        'SELECT id, cost_price, name FROM products'
      );

      const productCostMap = new Map(
        products.map((p) => [p.id, p.cost_price])
      );

      let totalCost = 0;
      let orderCount = 0;

      for (const order of recentOrders) {
        const items = order.items as Array<{ product_id: string; quantity: number }>;
        if (!items) continue;
        orderCount++;
        for (const item of items) {
          const cost = productCostMap.get(item.product_id) ?? 0;
          totalCost += cost * (item.quantity || 1);
        }
      }

      const daysInPeriod = Math.max(1, Math.ceil(
        (Date.now() - thirtyDaysAgo.getTime()) / (1000 * 60 * 60 * 24)
      ));

      const avgDailyCost = totalCost / daysInPeriod;
      const weeklyForecast = avgDailyCost * 7;
      const monthlyForecast = avgDailyCost * 30;
      const avgOrdersPerDay = orderCount / daysInPeriod;

      const wallet = await queryOne<{ balance: number }>(
        'SELECT balance FROM wallet_balances WHERE tenant_id = $1',
        [user.tenantId]
      );

      const currentBalance = wallet?.balance ?? 0;
      const daysUntilEmpty = avgDailyCost > 0
        ? Math.floor(currentBalance / avgDailyCost)
        : null;

      return reply.send({
        period_days: daysInPeriod,
        total_cost_30d: Math.round(totalCost * 100) / 100,
        total_orders_30d: orderCount,
        avg_daily_cost: Math.round(avgDailyCost * 100) / 100,
        avg_orders_per_day: Math.round(avgOrdersPerDay * 100) / 100,
        weekly_forecast: Math.round(weeklyForecast * 100) / 100,
        monthly_forecast: Math.round(monthlyForecast * 100) / 100,
        current_balance: currentBalance,
        days_until_empty: daysUntilEmpty,
      });
    }

    // ─── ACTION: check_charge_status ───────────────────────────
    // Quick check if a pending charge has been confirmed (for frontend polling).

    if (action === 'check_charge_status') {
      const { reference_id } = body as any;
      if (!reference_id) return reply.status(400).send({ error: 'reference_id é obrigatório' });

      const tx = await queryOne<{ status: string }>(
        `SELECT status FROM wallet_transactions
         WHERE tenant_id = $1 AND reference_id = $2 AND type = 'deposit'`,
        [user.tenantId, reference_id]
      );

      const wallet = await queryOne<{ balance: number }>(
        'SELECT balance FROM wallet_balances WHERE tenant_id = $1',
        [user.tenantId]
      );

      return reply.send({
        status: tx?.status ?? 'not_found',
        balance: wallet?.balance ?? 0,
      });
    }

    // ─── ACTION: cleanup_duplicates ────────────────────────────
    // Removes duplicate wallet transactions created by the old sync bug.
    // Finds confirmed deposits that share a reference_id, keeps the oldest, deletes newer ones.

    if (action === 'cleanup_duplicates') {
      const dupes = await queryMany<{ reference_id: string; cnt: string }>(
        `SELECT reference_id, COUNT(*) as cnt FROM wallet_transactions
         WHERE tenant_id = $1 AND type = 'deposit' AND status = 'confirmed' AND reference_id IS NOT NULL
         GROUP BY reference_id HAVING COUNT(*) > 1`,
        [user.tenantId]
      );

      let removed = 0;
      let balanceAdjust = 0;

      for (const dupe of dupes) {
        // Keep the oldest, delete the rest
        const txs = await queryMany<{ id: string; amount: number; created_at: string }>(
          `SELECT id, amount, created_at FROM wallet_transactions
           WHERE tenant_id = $1 AND reference_id = $2 AND type = 'deposit' AND status = 'confirmed'
           ORDER BY created_at ASC`,
          [user.tenantId, dupe.reference_id]
        );

        // Delete all but the first (oldest)
        for (let i = 1; i < txs.length; i++) {
          await query(`DELETE FROM wallet_transactions WHERE id = $1`, [txs[i].id]);
          balanceAdjust += txs[i].amount;
          removed++;
        }
      }

      // Recalculate correct balance from confirmed transactions
      const correctBalance = await queryOne<{ total: number }>(
        `SELECT COALESCE(
          (SELECT SUM(amount) FROM wallet_transactions WHERE tenant_id = $1 AND type = 'deposit' AND status = 'confirmed') -
          (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE tenant_id = $1 AND type = 'debit' AND status = 'confirmed'),
          0
        ) as total`,
        [user.tenantId]
      );

      const newBalance = correctBalance?.total ?? 0;
      await query(
        `INSERT INTO wallet_balances (tenant_id, balance, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (tenant_id) DO UPDATE SET balance = $2, updated_at = NOW()`,
        [user.tenantId, newBalance]
      );

      return reply.send({ removed, balance_corrected: newBalance });
    }

    // ─── ACTION: sync_pending_charges ─────────────────────────
    // Checks Asaas for actual payment status of pending wallet transactions.
    // If paid but webhook was missed: updates existing TX to confirmed + credits balance.
    // Does NOT call credit_wallet() to avoid duplicate transactions.

    if (action === 'sync_pending_charges') {
      const pending = await queryMany<{
        id: string; amount: number; reference_id: string; status: string;
      }>(
        `SELECT id, amount, reference_id, status FROM wallet_transactions
         WHERE tenant_id = $1 AND status = 'pending' AND type = 'deposit'
         ORDER BY created_at DESC`,
        [user.tenantId]
      );

      if (pending.length === 0) {
        return reply.send({ synced: 0, message: 'Nenhuma recarga pendente' });
      }

      let credited = 0;
      let cleaned = 0;
      const results: { id: string; amount: number; asaas_status: string; action: string }[] = [];

      for (const tx of pending) {
        try {
          const asaasRes = await fetch(`${ASAAS_API}/payments/${tx.reference_id}`, {
            headers: { access_token: env.ASAAS_API_KEY },
          });

          if (!asaasRes.ok) {
            results.push({ id: tx.reference_id, amount: tx.amount, asaas_status: 'fetch_error', action: 'skipped' });
            continue;
          }

          const asaasData: any = await asaasRes.json();
          const asaasStatus = asaasData.status as string;

          if (asaasStatus === 'CONFIRMED' || asaasStatus === 'RECEIVED') {
            // Payment was paid — update existing TX + credit balance directly (no duplicate TX)
            const balanceRow = await queryOne<{ balance: number }>(
              `UPDATE wallet_balances
               SET balance = balance + $1, updated_at = NOW()
               WHERE tenant_id = $2
               RETURNING balance`,
              [tx.amount, user.tenantId]
            );

            await query(
              `UPDATE wallet_transactions
               SET status = 'confirmed', confirmed_at = NOW(),
                   balance_after = $1,
                   description = $2
               WHERE id = $3`,
              [balanceRow?.balance ?? null, `Recarga PIX confirmada - Asaas #${tx.reference_id}`, tx.id]
            );

            credited++;
            results.push({ id: tx.reference_id, amount: tx.amount, asaas_status: asaasStatus, action: 'credited' });
          } else if (asaasStatus === 'OVERDUE' || asaasStatus === 'DELETED' || asaasStatus === 'REFUNDED') {
            await query(`UPDATE wallet_transactions SET status = 'failed' WHERE id = $1`, [tx.id]);
            cleaned++;
            results.push({ id: tx.reference_id, amount: tx.amount, asaas_status: asaasStatus, action: 'marked_failed' });
          } else {
            results.push({ id: tx.reference_id, amount: tx.amount, asaas_status: asaasStatus, action: 'still_pending' });
          }
        } catch (err) {
          results.push({ id: tx.reference_id, amount: tx.amount, asaas_status: 'error', action: 'skipped' });
        }
      }

      return reply.send({ synced: credited, cleaned, details: results });
    }

    // ─── ACTION: cancel_charge ──────────────────────────────────
    // Cancels a pending PIX charge in Asaas and marks the wallet TX as cancelled.

    if (action === 'cancel_charge') {
      const { reference_id } = body as any;
      if (!reference_id) {
        return reply.status(400).send({ error: 'reference_id é obrigatório' });
      }

      const tx = await queryOne<{ id: string; status: string }>(
        `SELECT id, status FROM wallet_transactions
         WHERE tenant_id = $1 AND reference_id = $2 AND type = 'deposit'`,
        [user.tenantId, reference_id]
      );

      if (!tx) return reply.status(404).send({ error: 'Transação não encontrada' });
      if (tx.status !== 'pending') return reply.status(400).send({ error: 'Só é possível cancelar cobranças pendentes' });

      // Delete charge in Asaas
      try {
        const delRes = await fetch(`${ASAAS_API}/payments/${reference_id}`, {
          method: 'DELETE',
          headers: { access_token: env.ASAAS_API_KEY },
        });
        if (!delRes.ok) {
          const errText = await delRes.text();
          logger.warn({ reference_id, status: delRes.status, error: errText }, 'Asaas charge delete failed');
        }
      } catch (err) {
        logger.warn({ reference_id }, 'Failed to delete Asaas charge');
      }

      await query(`UPDATE wallet_transactions SET status = 'cancelled' WHERE id = $1`, [tx.id]);

      return reply.send({ status: 'cancelled', reference_id });
    }

    // ─── ACTION: reopen_pix ─────────────────────────────────────
    // Returns stored PIX QR code and payment link for a pending charge.

    if (action === 'reopen_pix') {
      const { reference_id } = body as any;
      if (!reference_id) {
        return reply.status(400).send({ error: 'reference_id é obrigatório' });
      }

      const tx = await queryOne<{ id: string; status: string; amount: number; metadata: any }>(
        `SELECT id, status, amount, metadata FROM wallet_transactions
         WHERE tenant_id = $1 AND reference_id = $2 AND type = 'deposit'`,
        [user.tenantId, reference_id]
      );

      if (!tx) return reply.status(404).send({ error: 'Transação não encontrada' });
      if (tx.status !== 'pending') return reply.status(400).send({ error: 'Só é possível reabrir cobranças pendentes' });

      const meta = typeof tx.metadata === 'string' ? JSON.parse(tx.metadata) : tx.metadata;

      // Decrypt stored PIX data
      let pixCode = meta?.pix_code || null;
      let pixQrImage = meta?.pix_qr_image || null;

      if (pixCode) {
        try { pixCode = decrypt(pixCode); } catch { /* already plain */ }
      }
      if (pixQrImage) {
        try { pixQrImage = decrypt(pixQrImage); } catch { /* already plain */ }
      }

      // If we don't have stored data, try fetching fresh from Asaas
      if (!pixCode) {
        try {
          const pixRes = await fetch(`${ASAAS_API}/payments/${reference_id}/pixQrCode`, {
            headers: { access_token: env.ASAAS_API_KEY },
          });
          if (pixRes.ok) {
            const pixData: any = await pixRes.json();
            pixCode = pixData.payload || null;
            pixQrImage = pixData.encodedImage || null;
          }
        } catch {
          // ignore
        }
      }

      if (!pixCode) {
        return reply.status(400).send({ error: 'QR Code não disponível. A cobrança pode ter expirado.' });
      }

      return reply.send({
        pix_code: pixCode,
        pix_qr_image: pixQrImage,
        amount: tx.amount,
        reference_id,
      });
    }

    return reply.status(400).send({ error: 'Ação inválida' });
  });
}
