import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../config/database.js';
import { logger } from '../lib/logger.js';

// Routes and methods that should be audit-logged
const AUDITED_ROUTES: { method: string; pattern: RegExp; action: string; entityType: string }[] = [
  { method: 'POST', pattern: /^\/api\/users\/sellers$/, action: 'seller_created', entityType: 'seller' },
  { method: 'PATCH', pattern: /^\/api\/users\/sellers\//, action: 'seller_updated', entityType: 'seller' },
  { method: 'POST', pattern: /^\/api\/users\/operators$/, action: 'operator_created', entityType: 'operator' },
  { method: 'POST', pattern: /^\/api\/payments\/pix$/, action: 'payment_action', entityType: 'payment' },
  { method: 'POST', pattern: /^\/api\/payments\/webhook$/, action: 'webhook_received', entityType: 'webhook' },
  { method: 'POST', pattern: /^\/api\/webhooks\/asaas$/, action: 'webhook_asaas', entityType: 'webhook' },
  { method: 'PATCH', pattern: /^\/api\/tenants\//, action: 'tenant_updated', entityType: 'tenant' },
];

/**
 * Register audit logging hook.
 * Logs sensitive operations to audit_logs table after successful responses.
 */
export function registerAuditLog(app: FastifyInstance): void {
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    // Only log successful mutations (2xx status codes)
    if (reply.statusCode < 200 || reply.statusCode >= 300) return;

    const url = request.url.split('?')[0];
    const method = request.method;

    const match = AUDITED_ROUTES.find(r => r.method === method && r.pattern.test(url));
    if (!match) return;

    // Get user ID (may be null for webhooks)
    const userId = request.user?.sub;
    if (!userId) return; // Skip webhook routes (no user context)

    // Extract entity ID from URL params if available
    const urlParts = url.split('/');
    const entityId = urlParts.length > 4 ? urlParts[4] : null;

    try {
      await pool.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          match.action,
          match.entityType,
          entityId,
          JSON.stringify({ method, url, status: reply.statusCode }),
          request.ip,
        ]
      );
    } catch (err) {
      // Non-blocking — audit log failure shouldn't break the request
      logger.warn(err, 'Failed to write audit log');
    }
  });
}
