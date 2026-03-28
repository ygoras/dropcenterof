import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../../config/env.js';
import { query, queryOne, queryMany } from '../../lib/db.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { encrypt } from '../../lib/crypto.js';
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

  let asaasCustomerId = (tenant?.settings as Record<string, unknown>)?.asaas_customer_id as string | undefined;

  if (!asaasCustomerId) {
    const customerRes = await fetch(`${ASAAS_API}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: env.ASAAS_API_KEY },
      body: JSON.stringify({
        name: tenant?.name || tenantName,
        email,
        cpfCnpj: (tenant?.document || document)?.replace(/\D/g, '') || undefined,
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
  }

  return asaasCustomerId;
}

// ─── Route registration ────────────────────────────────────────────

interface PixActionBody {
  action: string;
  amount?: number;
  tenant_id?: string;
  subscription_id?: string;
  limit?: number;
}

export async function registerAsaasPixRoutes(app: FastifyInstance) {
  app.post('/api/payments/pix', {
    preHandler: [authMiddleware],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as PixActionBody;
    const { action } = body;
    const user = request.user;

    if (!user.tenantId) {
      return reply.status(400).send({ error: 'Perfil não encontrado' });
    }

    // ─── ACTION: generate_pix (wallet recharge) ──────────────────

    if (action === 'generate_pix') {
      const { amount } = body;

      if (!amount || amount <= 0) {
        return reply.status(400).send({ error: 'Valor inválido' });
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
        `SELECT * FROM wallet_transactions
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

    return reply.status(400).send({ error: 'Ação inválida' });
  });
}
