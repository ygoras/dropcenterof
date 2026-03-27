import { env } from '../config/env.js';
import { query, queryOne, queryMany } from '../lib/db.js';
import { encrypt } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';

const ASAAS_API = env.ASAAS_SANDBOX
  ? 'https://sandbox.asaas.com/api/v3'
  : 'https://api.asaas.com/v3';

interface BillingResult {
  tenant_id: string;
  status: string;
  error?: string;
}

/**
 * Billing cron: runs daily to generate PIX charges for subscriptions
 * whose billing_day matches today's day of the month.
 */
export async function runBillingCron(): Promise<void> {
  const today = new Date();
  const currentDay = today.getDate();

  logger.info({ billingDay: currentDay }, 'Billing cron started');

  // Find active/overdue subscriptions where billing_day = today
  const subscriptions = await queryMany<{
    id: string;
    tenant_id: string;
    plan_id: string;
    billing_day: number;
    status: string;
  }>(
    `SELECT id, tenant_id, plan_id, billing_day, status
     FROM subscriptions
     WHERE billing_day = $1 AND status IN ('active', 'overdue')`,
    [currentDay]
  );

  if (!subscriptions.length) {
    logger.info('No subscriptions to bill today');
    return;
  }

  const results: BillingResult[] = [];

  for (const sub of subscriptions) {
    try {
      // Check if there's already a pending/confirmed payment for this month
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString().split('T')[0];
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
        .toISOString().split('T')[0];

      const existingPayment = await queryOne<{ id: string; status: string }>(
        `SELECT id, status FROM payments
         WHERE subscription_id = $1
           AND due_date >= $2
           AND due_date <= $3
           AND status IN ('pending', 'confirmed')
         LIMIT 1`,
        [sub.id, monthStart, monthEnd]
      );

      if (existingPayment) {
        logger.info({ subscriptionId: sub.id }, 'Already has payment for this month, skipping');
        results.push({ tenant_id: sub.tenant_id, status: 'skipped_existing' });
        continue;
      }

      // Get plan
      const plan = await queryOne<{ id: string; name: string; price: number }>(
        'SELECT id, name, price FROM plans WHERE id = $1',
        [sub.plan_id]
      );

      if (!plan || plan.price <= 0) {
        results.push({ tenant_id: sub.tenant_id, status: 'skipped_free' });
        continue;
      }

      // Get tenant
      const tenant = await queryOne<{
        id: string;
        name: string;
        document: string | null;
        settings: Record<string, unknown> | null;
      }>(
        'SELECT id, name, document, settings FROM tenants WHERE id = $1',
        [sub.tenant_id]
      );

      const sellerProfile = await queryOne<{ name: string; email: string }>(
        'SELECT name, email FROM profiles WHERE tenant_id = $1 LIMIT 1',
        [sub.tenant_id]
      );

      // Get or create Asaas customer
      let asaasCustomerId = (tenant?.settings as Record<string, unknown>)?.asaas_customer_id as string | undefined;

      if (!asaasCustomerId) {
        const customerRes = await fetch(`${ASAAS_API}/customers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', access_token: env.ASAAS_API_KEY },
          body: JSON.stringify({
            name: tenant?.name || 'Vendedor',
            email: sellerProfile?.email || '',
            cpfCnpj: tenant?.document?.replace(/\D/g, '') || undefined,
            externalReference: sub.tenant_id,
          }),
        });

        if (!customerRes.ok) {
          const errText = await customerRes.text();
          logger.error({ tenantId: sub.tenant_id }, 'Failed to create Asaas customer');
          results.push({ tenant_id: sub.tenant_id, status: 'error', error: errText });
          continue;
        }

        const customerData: any = await customerRes.json();
        asaasCustomerId = customerData.id as string;

        const updatedSettings = { ...(tenant?.settings || {}), asaas_customer_id: asaasCustomerId };
        await query(
          'UPDATE tenants SET settings = $1, updated_at = NOW() WHERE id = $2',
          [JSON.stringify(updatedSettings), sub.tenant_id]
        );
      }

      // Calculate due date
      const dueDate = new Date(today.getFullYear(), today.getMonth(), sub.billing_day || 10);
      if (dueDate < today) {
        dueDate.setMonth(dueDate.getMonth() + 1);
      }

      // Create charge in Asaas
      const chargeRes = await fetch(`${ASAAS_API}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', access_token: env.ASAAS_API_KEY },
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: 'PIX',
          value: plan.price,
          dueDate: dueDate.toISOString().split('T')[0],
          description: `Plano ${plan.name} - ${tenant?.name || 'Vendedor'}`,
          externalReference: `plan:${sub.tenant_id}:${sub.id}`,
        }),
      });

      if (!chargeRes.ok) {
        const errText = await chargeRes.text();
        logger.error({ tenantId: sub.tenant_id }, 'Failed to create Asaas charge');
        results.push({ tenant_id: sub.tenant_id, status: 'error', error: errText });
        continue;
      }

      const chargeData: any = await chargeRes.json();

      // Get PIX QR Code
      const pixRes = await fetch(`${ASAAS_API}/payments/${chargeData.id}/pixQrCode`, {
        headers: { access_token: env.ASAAS_API_KEY },
      });

      let pixData: { encodedImage: string | null; payload: string | null } = {
        encodedImage: null,
        payload: null,
      };
      if (pixRes.ok) {
        pixData = await pixRes.json() as any;
      }

      // Encrypt PIX data before storing
      const encryptedPixCode = pixData.payload ? encrypt(pixData.payload) : null;
      const encryptedPixQrUrl = pixData.encodedImage
        ? encrypt(`data:image/png;base64,${pixData.encodedImage}`)
        : null;

      // Save payment record
      await query(
        `INSERT INTO payments
         (subscription_id, tenant_id, amount, due_date, status, pix_code, pix_qr_url, payment_gateway_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          sub.id,
          sub.tenant_id,
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
            sub.tenant_id,
            'plan_charge',
            `Cobrança do Plano ${plan.name}`,
            `Sua cobrança mensal de R$ ${plan.price.toFixed(2)} foi gerada. Pague via PIX até ${dueDate.toLocaleDateString('pt-BR')}.`,
            '/seller/plano',
            JSON.stringify({ plan_name: plan.name, amount: plan.price, asaas_id: chargeData.id }),
          ]
        );
      } catch (notifErr) {
        logger.warn(notifErr, 'Billing notification failed');
      }

      logger.info({ tenantId: sub.tenant_id, amount: plan.price, asaasId: chargeData.id }, 'Tenant billed');
      results.push({ tenant_id: sub.tenant_id, status: 'billed' });
    } catch (err) {
      logger.error(err, `Error billing tenant ${sub.tenant_id}`);
      results.push({ tenant_id: sub.tenant_id, status: 'error', error: (err as Error).message });
    }
  }

  const billed = results.filter((r) => r.status === 'billed').length;
  const errors = results.filter((r) => r.status === 'error').length;

  logger.info({ billed, errors, total: results.length }, 'Billing cron completed');
}
