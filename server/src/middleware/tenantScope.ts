import type { FastifyRequest, FastifyReply } from 'fastify';

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

export function getTenantFilter(request: FastifyRequest): { tenantId?: string; isAdmin: boolean } {
  const isAdmin = request.user.roles.includes('admin') || request.user.roles.includes('manager');
  return {
    tenantId: isAdmin ? undefined : request.user.tenantId ?? undefined,
    isAdmin,
  };
}
