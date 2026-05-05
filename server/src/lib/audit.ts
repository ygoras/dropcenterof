import { query } from './db.js';
import { logger } from './logger.js';

/**
 * Insert an audit log entry. Non-blocking: failures are logged but never throw.
 *
 * @param userId - The acting user (admin/operator/seller). Pass null for system actions.
 * @param action - Verb describing the action (seller_created, plan_changed, special_credit_granted, etc.)
 * @param entityType - The kind of entity affected (tenant, subscription, profile, payment...)
 * @param entityId - UUID of the affected entity (or null if not applicable)
 * @param details - Extra context. Will be serialized to JSONB. Include `old_values` and `new_values`
 *                  when applicable so reviewers can see what changed.
 */
export async function logAudit(
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, entityType, entityId, JSON.stringify(details ?? {})]
    );
  } catch (err) {
    // Audit must never break the calling flow — log and swallow
    logger.warn({ err, action, entityType, entityId }, 'audit log insert failed');
  }
}
