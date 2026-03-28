import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../../config/env.js';
import { query, queryOne, queryMany } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';

interface AsaasWebhookBody {
  event: string;
  payment: {
    id: string;
    value: number;
    externalReference: string;
    status: string;
    [key: string]: unknown;
  };
}

export async function registerAsaasWebhookRoutes(app: FastifyInstance) {
  app.post('/api/payments/webhook', async (request: FastifyRequest<{ Body: AsaasWebhookBody }>, reply: FastifyReply) => {
    // Webhook token validation
    const incomingToken = request.headers['asaas-access-token'] as string | undefined;
    logger.info({
      hasToken: !!incomingToken,
      tokenPreview: incomingToken ? incomingToken.substring(0, 8) + '...' : 'none',
      expectedPreview: env.ASAAS_WEBHOOK_TOKEN ? env.ASAAS_WEBHOOK_TOKEN.substring(0, 8) + '...' : 'none',
      match: incomingToken === env.ASAAS_WEBHOOK_TOKEN,
      headers: Object.keys(request.headers).filter(h => h.includes('asaas') || h.includes('token') || h.includes('access')),
    }, 'Asaas webhook auth debug');

    if (!incomingToken || incomingToken !== env.ASAAS_WEBHOOK_TOKEN) {
      logger.warn('Invalid or missing Asaas webhook token');
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const { event, payment } = request.body;

      if (!payment) {
        return reply.send({ status: 'ignored', reason: 'no_payment' });
      }

      const asaasPaymentId = payment.id;
      const externalReference = payment.externalReference as string;

      // Parse externalReference to determine type
      let refType: 'wallet' | 'plan' | 'legacy' = 'legacy';
      let tenantId = externalReference;
      let subscriptionId: string | null = null;

      if (externalReference?.startsWith('wallet:')) {
        refType = 'wallet';
        tenantId = externalReference.replace('wallet:', '');
      } else if (externalReference?.startsWith('plan:')) {
        refType = 'plan';
        const parts = externalReference.split(':');
        tenantId = parts[1];
        subscriptionId = parts[2] || null;
      }

      // ─── PAYMENT_CONFIRMED or PAYMENT_RECEIVED ──────────────────

      if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
        logger.info({ asaasPaymentId, refType, tenantId }, 'Payment confirmed');

        if (!tenantId) {
          logger.warn({ asaasPaymentId }, 'No tenant_id in payment');
          return reply.send({ status: 'ignored', reason: 'no_tenant' });
        }

        const amount = payment.value;

        // ── PLAN PAYMENT ──
        if (refType === 'plan') {
          const paymentRecord = await queryOne<{ id: string; status: string }>(
            'SELECT id, status FROM payments WHERE payment_gateway_id = $1',
            [asaasPaymentId]
          );

          if (paymentRecord?.status === 'confirmed') {
            logger.info({ asaasPaymentId }, 'Plan payment already confirmed, skipping');
            return reply.send({ status: 'already_processed' });
          }

          // Confirm the payment
          if (paymentRecord) {
            await query(
              'UPDATE payments SET status = $1, paid_at = NOW() WHERE id = $2',
              ['confirmed', paymentRecord.id]
            );
          }

          // Reactivate subscription if it was overdue/blocked
          if (subscriptionId) {
            await query(
              'UPDATE subscriptions SET status = $1, blocked_at = NULL WHERE id = $2',
              ['active', subscriptionId]
            );
          }

          // Reactivate seller profiles
          const profiles = await queryMany<{ id: string }>(
            'SELECT id FROM profiles WHERE tenant_id = $1',
            [tenantId]
          );

          for (const p of profiles) {
            await query(
              'UPDATE profiles SET is_active = TRUE WHERE id = $1',
              [p.id]
            );
          }

          // Notify seller
          try {
            await query(
              'SELECT create_notification($1, $2, $3, $4, $5, $6)',
              [
                tenantId,
                'plan_payment_confirmed',
                'Pagamento do plano confirmado!',
                `Seu pagamento de R$ ${amount.toFixed(2)} foi confirmado. Assinatura ativa.`,
                '/seller/dashboard',
                JSON.stringify({ amount, asaas_id: asaasPaymentId }),
              ]
            );
          } catch (notifErr) {
            logger.warn(notifErr, 'Failed to create plan payment notification');
          }

          logger.info({ tenantId, amount }, 'Plan payment processed');

          return reply.send({ status: 'processed', type: 'plan', amount });
        }

        // ── WALLET RECHARGE ──

        // Idempotency check
        const existingTx = await queryOne<{ id: string; status: string }>(
          `SELECT id, status FROM wallet_transactions
           WHERE reference_id = $1 AND type = 'deposit'`,
          [asaasPaymentId]
        );

        if (existingTx?.status === 'confirmed') {
          logger.info({ asaasPaymentId }, 'Payment already processed, skipping');
          return reply.send({ status: 'already_processed' });
        }

        // Credit the wallet — PL/pgSQL returns JSONB: {success, balance, transaction_id}
        const creditRow = await queryOne<{ credit_wallet: any }>(
          'SELECT credit_wallet($1, $2, $3, $4, $5)',
          [
            tenantId,
            amount,
            `Recarga PIX confirmada - Asaas #${asaasPaymentId}`,
            asaasPaymentId,
            'asaas_pix',
          ]
        );

        const creditResult = typeof creditRow?.credit_wallet === 'string'
          ? JSON.parse(creditRow.credit_wallet)
          : creditRow?.credit_wallet;

        if (!creditResult?.success) {
          logger.error({ tenantId, asaasPaymentId, creditResult }, 'Credit wallet failed');
          return reply.status(500).send({ status: 'error', reason: 'credit_wallet_failed' });
        }

        logger.info({ tenantId, balance: creditResult.balance, amount }, 'Wallet credited successfully');

        // Notify payment confirmed
        try {
          await query(
            'SELECT create_notification($1, $2, $3, $4, $5, $6)',
            [
              tenantId,
              'payment_confirmed',
              'Recarga confirmada!',
              `Seu PIX de R$ ${amount.toFixed(2)} foi confirmado. Saldo atualizado.`,
              '/seller/credito',
              JSON.stringify({ amount, asaas_id: asaasPaymentId }),
            ]
          );
        } catch (notifErr) {
          logger.warn(notifErr, 'Failed to create wallet recharge notification');
        }

        // Update pending transaction if exists
        if (existingTx) {
          await query(
            'UPDATE wallet_transactions SET status = $1, confirmed_at = NOW() WHERE id = $2',
            ['confirmed', existingTx.id]
          );
        }

        // Process pending_credit orders queue
        let ordersProcessed = 0;
        try {
          const processRow = await queryOne<{ process_pending_credit_orders: any }>(
            'SELECT process_pending_credit_orders($1)',
            [tenantId]
          );

          const processResult = typeof processRow?.process_pending_credit_orders === 'string'
            ? JSON.parse(processRow.process_pending_credit_orders)
            : processRow?.process_pending_credit_orders;

          ordersProcessed = processResult?.processed ?? 0;

          if (ordersProcessed > 0) {
            // Notify about released orders
            try {
              await query(
                'SELECT create_notification($1, $2, $3, $4, $5, $6)',
                [
                  tenantId,
                  'orders_released',
                  `${ordersProcessed} pedido(s) liberado(s)`,
                  'Seus pedidos bloqueados por crédito foram liberados e entraram na fila de separação.',
                  '/seller/pedidos',
                  JSON.stringify({ processed: ordersProcessed }),
                ]
              );
            } catch (notifErr) {
              logger.warn(notifErr, 'Failed to create orders released notification');
            }

            // Create picking tasks for newly approved orders
            const approvedOrders = await queryMany<{ id: string }>(
              `SELECT id FROM orders
               WHERE tenant_id = $1 AND status = 'approved'
               ORDER BY updated_at DESC
               LIMIT $2`,
              [tenantId, ordersProcessed]
            );

            for (const order of approvedOrders) {
              const existingTask = await queryOne<{ id: string }>(
                'SELECT id FROM picking_tasks WHERE order_id = $1',
                [order.id]
              );

              if (!existingTask) {
                await query(
                  `INSERT INTO picking_tasks (order_id, status) VALUES ($1, 'pending')`,
                  [order.id]
                );
                logger.info({ orderId: order.id }, 'Auto-created picking task');
              }
            }
          }
        } catch (processErr) {
          logger.error(processErr, 'Process pending orders failed');
        }

        return reply.send({
          status: 'processed',
          type: 'wallet',
          credited: amount,
          orders_processed: ordersProcessed,
        });
      }

      // ─── PAYMENT_OVERDUE ────────────────────────────────────────

      if (event === 'PAYMENT_OVERDUE') {
        if (refType === 'plan') {
          // Mark plan payment as expired and subscription as overdue
          await query(
            `UPDATE payments SET status = 'expired' WHERE payment_gateway_id = $1`,
            [asaasPaymentId]
          );

          if (subscriptionId) {
            await query(
              `UPDATE subscriptions SET status = 'overdue' WHERE id = $1`,
              [subscriptionId]
            );
          }

          // Notify seller
          try {
            await query(
              'SELECT create_notification($1, $2, $3, $4, $5, $6)',
              [
                tenantId,
                'plan_overdue',
                'Pagamento do plano vencido!',
                'Seu plano está inadimplente. Regularize para evitar bloqueio.',
                '/seller/dashboard',
                JSON.stringify({ asaas_id: asaasPaymentId }),
              ]
            );
          } catch (notifErr) {
            logger.warn(notifErr, 'Failed to create overdue notification');
          }
        } else {
          // Wallet recharge overdue
          await query(
            `UPDATE wallet_transactions SET status = 'failed'
             WHERE reference_id = $1 AND status = 'pending'`,
            [asaasPaymentId]
          );
        }

        logger.info({ asaasPaymentId, refType }, 'Payment marked overdue');
        return reply.send({ status: 'marked_overdue', type: refType });
      }

      // ─── PAYMENT_DELETED / PAYMENT_REFUNDED ─────────────────────

      if (event === 'PAYMENT_DELETED' || event === 'PAYMENT_REFUNDED') {
        if (refType === 'plan') {
          const newStatus = event === 'PAYMENT_REFUNDED' ? 'refunded' : 'expired';
          await query(
            'UPDATE payments SET status = $1 WHERE payment_gateway_id = $2',
            [newStatus, asaasPaymentId]
          );
        } else {
          await query(
            `UPDATE wallet_transactions SET status = 'cancelled'
             WHERE reference_id = $1 AND status = 'pending'`,
            [asaasPaymentId]
          );

          // If refunded and was confirmed, debit back
          if (event === 'PAYMENT_REFUNDED' && tenantId && payment.value) {
            try {
              await query(
                'SELECT debit_wallet($1, $2, $3, $4, $5)',
                [
                  tenantId,
                  payment.value,
                  `Estorno PIX - Asaas #${asaasPaymentId}`,
                  asaasPaymentId,
                  'asaas_refund',
                ]
              );
              logger.info({ tenantId, amount: payment.value, asaasPaymentId }, 'Refund processed');
            } catch (debitErr) {
              logger.error(debitErr, 'Debit wallet for refund failed');
            }
          }
        }

        return reply.send({ status: 'processed' });
      }

      // Other events - just acknowledge
      logger.debug({ event }, 'Asaas event ignored');
      return reply.send({ status: 'ignored', event });
    } catch (error) {
      logger.error(error, 'Asaas webhook processing error');
      // Return 200 to prevent Asaas from retrying on our app errors
      return reply.send({ error: (error as Error).message });
    }
  });
}
