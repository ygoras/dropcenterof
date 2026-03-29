import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'crypto';
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
    // --- Signature validation using HMAC-SHA256 (Svix headers) ---
    const webhookSecret = env.CLERK_WEBHOOK_SECRET;
    if (webhookSecret) {
      const svixId = request.headers['svix-id'] as string | undefined;
      const svixTimestamp = request.headers['svix-timestamp'] as string | undefined;
      const svixSignature = request.headers['svix-signature'] as string | undefined;

      if (!svixId || !svixTimestamp || !svixSignature) {
        logger.warn('Clerk webhook missing Svix signature headers');
        return reply.status(401).send({ error: 'Missing webhook signature headers' });
      }

      // Reject timestamps older than 5 minutes to prevent replay attacks
      const ts = parseInt(svixTimestamp, 10);
      const now = Math.floor(Date.now() / 1000);
      if (isNaN(ts) || Math.abs(now - ts) > 300) {
        logger.warn({ svixTimestamp, now }, 'Clerk webhook timestamp out of tolerance');
        return reply.status(401).send({ error: 'Webhook timestamp expired' });
      }

      // The secret from Clerk starts with "whsec_" — strip prefix and decode base64
      const secretBytes = Buffer.from(
        webhookSecret.startsWith('whsec_') ? webhookSecret.slice(6) : webhookSecret,
        'base64'
      );

      // Svix signing payload: "{msg_id}.{timestamp}.{body}"
      const rawBody = (request as any).rawBody || JSON.stringify(request.body);
      const signPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
      const expectedSig = createHmac('sha256', secretBytes)
        .update(signPayload)
        .digest('base64');

      // svix-signature may contain multiple sigs separated by spaces: "v1,<sig1> v1,<sig2>"
      const sigCandidates = svixSignature.split(' ').map(s => s.replace(/^v1,/, ''));
      const isValid = sigCandidates.some((candidate) => {
        try {
          const candidateBuf = Buffer.from(candidate, 'base64');
          const expectedBuf = Buffer.from(expectedSig, 'base64');
          return candidateBuf.length === expectedBuf.length && timingSafeEqual(candidateBuf, expectedBuf);
        } catch {
          return false;
        }
      });

      if (!isValid) {
        logger.warn({ svixId }, 'Clerk webhook signature validation failed');
        return reply.status(401).send({ error: 'Invalid webhook signature' });
      }
    } else {
      logger.warn('CLERK_WEBHOOK_SECRET not set — skipping webhook signature validation');
    }

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

      try {
        await query(
          `UPDATE profiles SET email = $1, name = COALESCE(NULLIF($2, ''), name) WHERE id = (
            SELECT id FROM auth_users WHERE clerk_user_id = $3
          )`,
          [email, fullName, clerkUserId]
        );
      } catch (err) {
        logger.error(err, 'Failed to update profile from Clerk webhook');
      }
    }

    if (type === 'user.deleted') {
      const clerkUserId = data.id as string;
      try {
        await query(
          `UPDATE profiles SET is_active = false WHERE id = (
            SELECT id FROM auth_users WHERE clerk_user_id = $1
          )`,
          [clerkUserId]
        );
      } catch (err) {
        logger.error(err, 'Failed to deactivate profile from Clerk webhook');
      }
    }

    return reply.send({ received: true });
  });

  // Admin: migrate existing users to Clerk (one-time use)
  app.post('/api/admin/migrate-to-clerk', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    // Only admin can run this
    if (!request.user.roles.includes('admin')) {
      return reply.status(403).send({ error: 'Admin only' });
    }

    const { rows: users } = await query<{
      id: string; email: string; name: string; password_hash: string; clerk_user_id: string | null;
    }>(
      `SELECT au.id, au.email, au.password_hash, au.clerk_user_id, p.name
       FROM auth_users au
       JOIN profiles p ON p.id = au.id
       WHERE au.clerk_user_id IS NULL`
    );

    const results: { email: string; status: string; clerkId?: string }[] = [];

    for (const user of users) {
      try {
        // Create user in Clerk
        const nameParts = (user.name || user.email.split('@')[0]).split(' ');
        const clerkUser = await clerkClient.users.createUser({
          emailAddress: [user.email],
          firstName: nameParts[0],
          lastName: nameParts.slice(1).join(' ') || undefined,
          skipPasswordRequirement: true,
        });

        // Link clerk_user_id in our DB
        await query(
          `UPDATE auth_users SET clerk_user_id = $1 WHERE id = $2`,
          [clerkUser.id, user.id]
        );

        results.push({ email: user.email, status: 'migrated', clerkId: clerkUser.id });
        logger.info({ email: user.email, clerkId: clerkUser.id }, 'User migrated to Clerk');
      } catch (err: any) {
        const msg = err?.errors?.[0]?.longMessage || err?.message || 'Unknown error';
        results.push({ email: user.email, status: `failed: ${msg}` });
        logger.warn({ email: user.email, error: msg }, 'Failed to migrate user to Clerk');
      }
    }

    return reply.send({ migrated: results.filter(r => r.status === 'migrated').length, total: users.length, results });
  });
}
