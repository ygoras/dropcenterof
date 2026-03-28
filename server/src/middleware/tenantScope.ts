import type { FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../config/database.js';

export async function tenantScope(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    return reply.status(401).send({ error: 'Não autenticado' });
  }

  const isAdmin = request.user.roles.includes('admin') || request.user.roles.includes('manager');

  if (!isAdmin && !request.user.tenantId) {
    return reply.status(403).send({ error: 'Tenant não associado ao usuário' });
  }
}

/**
 * Sets PostgreSQL session variables for RLS policies.
 * Call this in routes that need RLS enforcement.
 */
export async function setRlsContext(request: FastifyRequest, client?: import('pg').PoolClient): Promise<void> {
  const isAdmin = request.user.roles.includes('admin') || request.user.roles.includes('manager');
  const tenantId = request.user.tenantId || '';
  const target = client || pool;

  await target.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
  await target.query(`SET LOCAL app.is_admin = $1`, [isAdmin ? 'true' : 'false']);
}

export function getTenantFilter(request: FastifyRequest): { tenantId?: string; isAdmin: boolean } {
  const isAdmin = request.user.roles.includes('admin') || request.user.roles.includes('manager');
  return {
    tenantId: isAdmin ? undefined : request.user.tenantId ?? undefined,
    isAdmin,
  };
}
