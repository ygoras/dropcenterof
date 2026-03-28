import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware, clerkClient } from '../../middleware/auth.js';
import * as authService from '../../services/authService.js';
import { query, queryOne } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';

export async function registerAuthRoutes(app: FastifyInstance) {
  // Get current user profile (Clerk session → app profile)
  app.get('/api/auth/me', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const profile = await authService.getUserProfile(request.user.sub);
    if (!profile) {
      return reply.status(404).send({ error: 'Perfil não encontrado' });
    }
    return reply.send(profile);
  });

  // Clerk webhook — syncs user events (user.created, user.updated, user.deleted)
  app.post('/api/webhooks/clerk', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const evt = body as { type?: string; data?: Record<string, unknown> };

    if (!evt.type || !evt.data) {
      return reply.status(400).send({ error: 'Invalid webhook payload' });
    }

    const { type, data } = evt;

    if (type === 'user.created') {
      const clerkUserId = data.id as string;
      const email = (data.email_addresses as any[])?.[0]?.email_address || '';
      const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ') || email.split('@')[0];

      // Check if user already exists
      const existing = await queryOne(
        'SELECT id FROM auth_users WHERE clerk_user_id = $1',
        [clerkUserId]
      );

      if (!existing) {
        try {
          await authService.createUserFromClerk(clerkUserId, email, fullName);
          logger.info({ clerkUserId, email }, 'Clerk user synced to app');
        } catch (err) {
          logger.error(err, 'Failed to sync Clerk user');
        }
      }
    }

    if (type === 'user.updated') {
      const clerkUserId = data.id as string;
      const email = (data.email_addresses as any[])?.[0]?.email_address || '';
      const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ');

      await query(
        `UPDATE profiles SET email = $1, name = COALESCE(NULLIF($2, ''), name) WHERE id = (
          SELECT id FROM auth_users WHERE clerk_user_id = $3
        )`,
        [email, fullName, clerkUserId]
      );
    }

    if (type === 'user.deleted') {
      const clerkUserId = data.id as string;
      await query(
        `UPDATE profiles SET is_active = false WHERE id = (
          SELECT id FROM auth_users WHERE clerk_user_id = $1
        )`,
        [clerkUserId]
      );
    }

    return reply.send({ received: true });
  });
}
