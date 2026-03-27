import type { FastifyRequest, FastifyReply } from 'fastify';

export function requireRole(...allowedRoles: string[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return reply.status(401).send({ error: 'Não autenticado' });
    }

    const hasRole = request.user.roles.some(role => allowedRoles.includes(role));
    if (!hasRole) {
      return reply.status(403).send({ error: 'Permissão insuficiente' });
    }
  };
}
