import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validateBody } from '../../middleware/validateBody.js';
import { authMiddleware } from '../../middleware/auth.js';
import * as authService from '../../services/authService.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

export async function registerAuthRoutes(app: FastifyInstance) {
  // Login with rate limiting
  app.post('/api/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    preHandler: [validateBody(loginSchema)],
  }, async (request, reply) => {
    const { email, password } = request.body as z.infer<typeof loginSchema>;

    const result = await authService.login(email, password);
    if (!result) {
      return reply.status(401).send({ error: 'Credenciais inválidas' });
    }

    return reply.send(result);
  });

  // Register with rate limiting
  app.post('/api/auth/register', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
    preHandler: [validateBody(registerSchema)],
  }, async (request, reply) => {
    const { email, password, fullName } = request.body as z.infer<typeof registerSchema>;

    try {
      const result = await authService.register(email, password, fullName);
      return reply.status(201).send(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('duplicate key') || message.includes('unique')) {
        return reply.status(409).send({ error: 'Email já cadastrado' });
      }
      throw err;
    }
  });

  // Refresh token
  app.post('/api/auth/refresh', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    preHandler: [validateBody(refreshSchema)],
  }, async (request, reply) => {
    const { refreshToken } = request.body as z.infer<typeof refreshSchema>;

    const result = await authService.refreshTokens(refreshToken);
    if (!result) {
      return reply.status(401).send({ error: 'Refresh token inválido ou expirado' });
    }

    return reply.send(result);
  });

  // Logout
  app.post('/api/auth/logout', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken?: string };
    if (refreshToken) {
      await authService.revokeRefreshToken(refreshToken);
    }
    return reply.send({ success: true });
  });

  // Get current user profile
  app.get('/api/auth/me', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const profile = await authService.getUserProfile(request.user.sub);
    if (!profile) {
      return reply.status(404).send({ error: 'Perfil não encontrado' });
    }
    return reply.send(profile);
  });
}
