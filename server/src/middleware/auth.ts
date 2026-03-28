import type { FastifyRequest, FastifyReply } from 'fastify';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { env } from '../config/env.js';
import { queryOne } from '../lib/db.js';

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

const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });

export { clerkClient };

/**
 * Auth middleware — verifies Clerk session token and maps to app user.
 * Maintains the same request.user interface so all routes work unchanged.
 */
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
    // Verify Clerk session token
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });

    const clerkUserId = payload.sub;

    // Look up the app user by clerk_user_id
    const profile = await queryOne<{
      id: string;
      email: string;
      tenant_id: string | null;
    }>(
      `SELECT p.id, p.email, p.tenant_id
       FROM profiles p
       JOIN auth_users au ON au.id = p.id
       WHERE au.clerk_user_id = $1`,
      [clerkUserId]
    );

    if (!profile) {
      return reply.status(401).send({ error: 'Usuário não encontrado no sistema' });
    }

    // Get roles
    const rolesResult = await queryOne<{ roles: string[] }>(
      `SELECT ARRAY_AGG(role) as roles FROM user_roles WHERE user_id = $1`,
      [profile.id]
    );

    request.user = {
      sub: profile.id,
      email: profile.email,
      roles: rolesResult?.roles ?? [],
      tenantId: profile.tenant_id,
    };
  } catch {
    return reply.status(401).send({ error: 'Token inválido ou expirado' });
  }
}
