import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  tenantId: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Token de autenticação ausente' });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    request.user = payload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return reply.status(401).send({ error: 'Token expirado' });
    }
    return reply.status(401).send({ error: 'Token inválido' });
  }
}
