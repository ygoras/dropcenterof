import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validateBody } from '../../middleware/validateBody.js';
import * as authService from '../../services/authService.js';
import { queryMany, queryOne, query } from '../../lib/db.js';
import { getTenantFilter } from '../../middleware/tenantScope.js';

const createSellerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  storeName: z.string().min(2),
  phone: z.string().optional(),
  document: z.string().optional(),
});

const createOperatorSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
});

export async function registerUserRoutes(app: FastifyInstance) {
  // Create seller (admin only)
  app.post('/api/users/sellers', {
    preHandler: [authMiddleware, requireRole('admin', 'manager'), validateBody(createSellerSchema)],
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof createSellerSchema>;

    // Create tenant first
    const tenant = await queryOne<{ id: string }>(
      `INSERT INTO tenants (name, document, phone, settings)
       VALUES ($1, $2, $3, '{}')
       RETURNING id`,
      [body.storeName, body.document ?? null, body.phone ?? null]
    );

    if (!tenant) {
      return reply.status(500).send({ error: 'Falha ao criar tenant' });
    }

    try {
      const user = await authService.createUserWithRole(
        body.email,
        body.password,
        body.fullName,
        'seller',
        tenant.id
      );

      // Create default subscription
      const defaultPlan = await queryOne<{ id: string }>(
        `SELECT id FROM plans WHERE is_default = true LIMIT 1`
      );

      if (defaultPlan) {
        await query(
          `INSERT INTO subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
           VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '30 days')`,
          [tenant.id, defaultPlan.id]
        );
      }

      return reply.status(201).send(user);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('duplicate key') || message.includes('unique')) {
        return reply.status(409).send({ error: 'Email já cadastrado' });
      }
      throw err;
    }
  });

  // Create operator (admin only)
  app.post('/api/users/operators', {
    preHandler: [authMiddleware, requireRole('admin', 'manager'), validateBody(createOperatorSchema)],
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof createOperatorSchema>;

    try {
      const user = await authService.createUserWithRole(
        body.email,
        body.password,
        body.fullName,
        'operator'
      );

      return reply.status(201).send(user);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('duplicate key') || message.includes('unique')) {
        return reply.status(409).send({ error: 'Email já cadastrado' });
      }
      throw err;
    }
  });

  // List sellers (admin)
  app.get('/api/users/sellers', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async (request) => {
    const sellers = await queryMany(
      `SELECT p.id, p.email, p.name, p.tenant_id, p.avatar_url, p.created_at,
              t.name as store_name, t.document, t.phone,
              s.status as subscription_status, s.plan_id,
              pl.name as plan_name
       FROM profiles p
       JOIN user_roles ur ON ur.user_id = p.id
       LEFT JOIN tenants t ON t.id = p.tenant_id
       LEFT JOIN subscriptions s ON s.tenant_id = p.tenant_id
       LEFT JOIN plans pl ON pl.id = s.plan_id
       WHERE ur.role = 'seller'
       ORDER BY p.created_at DESC`
    );
    return sellers;
  });

  // List operators (admin)
  app.get('/api/users/operators', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async (request) => {
    const operators = await queryMany(
      `SELECT p.id, p.email, p.name, p.created_at
       FROM profiles p
       JOIN user_roles ur ON ur.user_id = p.id
       WHERE ur.role = 'operator'
       ORDER BY p.created_at DESC`
    );
    return operators;
  });

  // Delete user (admin)
  app.delete('/api/users/:userId', {
    preHandler: [authMiddleware, requireRole('admin')],
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string };

    await authService.revokeAllUserTokens(userId);
    await query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM profiles WHERE id = $1`, [userId]);
    await query(`DELETE FROM auth_users WHERE id = $1`, [userId]);

    return reply.send({ success: true });
  });
}
