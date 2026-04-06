import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware, clerkClient } from '../../middleware/auth.js';
import { logger } from '../../lib/logger.js';
import { requireRole } from '../../middleware/rbac.js';
import { validateBody } from '../../middleware/validateBody.js';
import * as authService from '../../services/authService.js';
import { queryMany, queryOne, query } from '../../lib/db.js';
import { getTenantFilter } from '../../middleware/tenantScope.js';

const createSellerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  company_name: z.string().min(2),
  phone: z.string().nullable().optional(),
  company_document: z.string().nullable().optional(),
  plan_id: z.string().uuid().optional(),
  // billing_day removido — calculado automaticamente (dia da criação)
});

const createOperatorSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  phone: z.string().nullable().optional(),
});

export async function registerUserRoutes(app: FastifyInstance) {
  // Create seller (admin only)
  app.post('/api/users/sellers', {
    preHandler: [authMiddleware, requireRole('admin', 'manager'), validateBody(createSellerSchema)],
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof createSellerSchema>;

    // Create tenant first
    const slug = body.company_name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      + '-' + Date.now().toString(36);

    const tenant = await queryOne<{ id: string }>(
      `INSERT INTO tenants (name, slug, document, settings)
       VALUES ($1, $2, $3, '{}')
       RETURNING id`,
      [body.company_name, slug, body.company_document ?? null]
    );

    if (!tenant) {
      return reply.status(500).send({ error: 'Falha ao criar tenant' });
    }

    try {
      const user = await authService.createUserWithRole(
        body.email,
        body.password,
        body.name,
        'seller',
        tenant.id,
        body.phone
      );

      // Create subscription with provided plan or default
      const planId = body.plan_id;
      const plan = planId
        ? await queryOne<{ id: string }>(`SELECT id FROM plans WHERE id = $1`, [planId])
        : await queryOne<{ id: string }>(`SELECT id FROM plans WHERE is_active = true ORDER BY price ASC LIMIT 1`);

      if (plan) {
        const billingDay = new Date().getDate(); // dia de criação = dia de cobrança
        await query(
          `INSERT INTO subscriptions (tenant_id, plan_id, status, billing_day, current_period_start, current_period_end)
           VALUES ($1, $2, 'pending', $3, NOW(), NOW() + INTERVAL '30 days')`,
          [tenant.id, plan.id, billingDay]
        );
      }

      return reply.status(201).send(user);
    } catch (err: any) {
      const message = err?.message || '';
      if (message.includes('duplicate key') || message.includes('unique')) {
        return reply.status(409).send({ error: 'Email já cadastrado' });
      }
      if (err?.clerkError && err?.errors?.length > 0) {
        const code = err.errors[0].code;
        const clerkTranslations: Record<string, string> = {
          'form_password_pwned': 'Esta senha foi encontrada em um vazamento de dados. Por segurança, use uma senha diferente.',
          'form_password_length_too_short': 'A senha é muito curta. Use pelo menos 8 caracteres.',
          'form_identifier_exists': 'Este e-mail já está cadastrado.',
          'form_password_not_strong_enough': 'A senha não é forte o suficiente. Use letras, números e caracteres especiais.',
          'form_param_format_invalid': 'Formato de e-mail inválido.',
        };
        const msg = clerkTranslations[code] || err.errors[0].longMessage || err.errors[0].message;
        return reply.status(422).send({ error: msg });
      }
      throw err;
    }
  });

  // Update seller (admin only) — toggle active, edit fields
  app.patch('/api/users/sellers/:sellerId', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async (request, reply) => {
    const { sellerId } = request.params as { sellerId: string };
    const body = request.body as {
      is_active?: boolean;
      name?: string;
      phone?: string;
      company_name?: string;
      company_document?: string;
      plan_id?: string;
    } | null;

    if (!body || Object.keys(body).length === 0) {
      return reply.status(400).send({ error: 'Nada para atualizar' });
    }

    // Get profile to find tenant_id
    const profile = await queryOne<{ tenant_id: string | null }>(
      `SELECT tenant_id FROM profiles WHERE id = $1`,
      [sellerId]
    );

    if (!profile) {
      return reply.status(404).send({ error: 'Vendedor não encontrado' });
    }

    // Update profile fields
    if (body.name || body.phone) {
      const updates: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      if (body.name) { updates.push(`name = $${idx++}`); params.push(body.name); }
      if (body.phone) { updates.push(`phone = $${idx++}`); params.push(body.phone); }
      params.push(sellerId);
      await query(
        `UPDATE profiles SET ${updates.join(', ')} WHERE id = $${idx}`,
        params
      );
    }

    // Update tenant fields
    if (profile.tenant_id && (body.is_active !== undefined || body.company_name || body.company_document)) {
      const updates: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      if (body.is_active !== undefined) {
        updates.push(`status = $${idx++}`);
        params.push(body.is_active ? 'active' : 'suspended');
      }
      if (body.company_name) { updates.push(`name = $${idx++}`); params.push(body.company_name); }
      if (body.company_document) { updates.push(`document = $${idx++}`); params.push(body.company_document); }
      params.push(profile.tenant_id);
      await query(
        `UPDATE tenants SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
        params
      );
    }

    // Update subscription plan if plan_id changed
    if (body.plan_id && profile.tenant_id) {
      await query(
        `UPDATE subscriptions SET plan_id = $1, updated_at = NOW()
         WHERE tenant_id = $2`,
        [body.plan_id, profile.tenant_id]
      );

      // Cancel pending payments with old plan price (seller will generate new PIX)
      await query(
        `UPDATE payments SET status = 'expired'
         WHERE tenant_id = $1 AND status = 'pending'`,
        [profile.tenant_id]
      );
    }

    // When deactivating: also set profile inactive + ban in Clerk
    if (body.is_active === false) {
      await query(`UPDATE profiles SET is_active = false WHERE id = $1`, [sellerId]);

      // Ban user in Clerk (blocks login, reversible with unban)
      try {
        const authUser = await queryOne<{ clerk_user_id: string | null }>(
          `SELECT clerk_user_id FROM auth_users WHERE id = $1`, [sellerId]
        );
        if (authUser?.clerk_user_id) {
          await clerkClient.users.banUser(authUser.clerk_user_id);
        }
      } catch (err) {
        logger.warn({ sellerId }, 'Failed to ban user in Clerk');
      }
    }

    // When reactivating: also set profile active + unban in Clerk
    if (body.is_active === true) {
      await query(`UPDATE profiles SET is_active = true WHERE id = $1`, [sellerId]);

      try {
        const authUser = await queryOne<{ clerk_user_id: string | null }>(
          `SELECT clerk_user_id FROM auth_users WHERE id = $1`, [sellerId]
        );
        if (authUser?.clerk_user_id) {
          await clerkClient.users.unbanUser(authUser.clerk_user_id);
        }
      } catch (err) {
        logger.warn({ sellerId }, 'Failed to unban user in Clerk');
      }
    }

    return { success: true };
  });

  // Delete seller (admin only)
  app.delete('/api/users/sellers/:sellerId', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async (request, reply) => {
    const { sellerId } = request.params as { sellerId: string };

    const profile = await queryOne<{ tenant_id: string | null }>(
      `SELECT tenant_id FROM profiles WHERE id = $1`,
      [sellerId]
    );

    if (!profile) {
      return reply.status(404).send({ error: 'Vendedor não encontrado' });
    }

    // Soft delete: suspend tenant
    if (profile.tenant_id) {
      await query(`UPDATE tenants SET status = 'suspended', updated_at = NOW() WHERE id = $1`, [profile.tenant_id]);
    }

    // Delete auth user (cascades to profiles, user_roles via FK)
    await query(`DELETE FROM auth_users WHERE id = $1`, [sellerId]);

    return { success: true };
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
        body.name,
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
              t.name as tenant_name, t.document, p.phone,
              t.status as tenant_status,
              CASE WHEN t.status = 'active' THEN true ELSE false END as is_active,
              s.status as subscription_status, s.plan_id, s.billing_day,
              s.current_period_end,
              pl.name as plan_name, pl.price as plan_price
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

  // List all profiles (admin)
  app.get('/api/profiles', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async () => {
    return queryMany(
      `SELECT id, email, name, tenant_id, phone, avatar_url, created_at FROM profiles ORDER BY created_at DESC`
    );
  });

  // Update profile
  app.patch('/api/profiles/:profileId', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { profileId } = request.params as { profileId: string };
    const { name, phone } = request.body as { name?: string; phone?: string | null };
    const userId = request.user.sub;

    // Users can only update their own profile (admins can update any)
    const roles = request.user.roles || [];
    if (profileId !== userId && !roles.includes('admin')) {
      return reply.status(403).send({ error: 'Sem permissão' });
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (name !== undefined) { params.push(name); sets.push(`name = $${params.length}`); }
    if (phone !== undefined) { params.push(phone); sets.push(`phone = $${params.length}`); }

    if (sets.length === 0) return reply.send({ success: true });

    params.push(profileId);
    await query(`UPDATE profiles SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    return reply.send({ success: true });
  });

  // List user roles (admin)
  app.get('/api/user-roles', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async (request) => {
    const { role } = request.query as { role?: string };
    const params: unknown[] = [];
    let where = '';
    if (role) {
      params.push(role);
      where = `WHERE ur.role = $${params.length}`;
    }
    return queryMany(
      `SELECT ur.user_id, ur.role, p.name, p.email, p.tenant_id
       FROM user_roles ur
       LEFT JOIN profiles p ON p.id = ur.user_id
       ${where}
       ORDER BY p.created_at DESC`,
      params
    );
  });

  // Delete user (admin)
  app.delete('/api/users/:userId', {
    preHandler: [authMiddleware, requireRole('admin')],
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string };

    // Clerk manages session revocation
    await query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM profiles WHERE id = $1`, [userId]);
    await query(`DELETE FROM auth_users WHERE id = $1`, [userId]);

    return reply.send({ success: true });
  });

  // ─── Operator aliases (frontend uses /api/operators) ──────────────
  app.get('/api/operators', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async () => {
    return queryMany(
      `SELECT p.id, p.email, p.name, p.phone, p.is_active, p.created_at
       FROM profiles p
       JOIN user_roles ur ON ur.user_id = p.id
       WHERE ur.role = 'operator'
       ORDER BY p.created_at DESC`
    );
  });

  app.post('/api/operators', {
    preHandler: [authMiddleware, requireRole('admin', 'manager'), validateBody(createOperatorSchema)],
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof createOperatorSchema>;
    try {
      const user = await authService.createUserWithRole(body.email, body.password, body.name, 'operator');
      return reply.status(201).send(user);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('duplicate key') || message.includes('unique')) {
        return reply.status(409).send({ error: 'Email já cadastrado' });
      }
      throw err;
    }
  });

  app.patch('/api/operators/:operatorId', {
    preHandler: [authMiddleware, requireRole('admin', 'manager')],
  }, async (request, reply) => {
    const { operatorId } = request.params as { operatorId: string };
    const body = request.body as { name?: string; phone?: string; is_active?: boolean };

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.name !== undefined) { params.push(body.name); sets.push(`name = $${params.length}`); }
    if (body.phone !== undefined) { params.push(body.phone); sets.push(`phone = $${params.length}`); }
    if (body.is_active !== undefined) { params.push(body.is_active); sets.push(`is_active = $${params.length}`); }

    if (sets.length === 0) return reply.send({ success: true });

    params.push(operatorId);
    await query(`UPDATE profiles SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    return reply.send({ success: true });
  });

  app.delete('/api/operators/:operatorId', {
    preHandler: [authMiddleware, requireRole('admin')],
  }, async (request, reply) => {
    const { operatorId } = request.params as { operatorId: string };
    // Clerk manages session revocation
    await query(`DELETE FROM user_roles WHERE user_id = $1`, [operatorId]);
    await query(`DELETE FROM profiles WHERE id = $1`, [operatorId]);
    await query(`DELETE FROM auth_users WHERE id = $1`, [operatorId]);
    return reply.send({ success: true });
  });

  // ─── INTERNAL USERS (admin/manager) ──────────────────────────────

  // List internal users (admins and managers)
  app.get('/api/admin/internal-users', {
    preHandler: [authMiddleware, requireRole('admin')],
  }, async () => {
    return queryMany(
      `SELECT p.id, p.name, p.email, p.phone, p.is_active, p.created_at,
              ARRAY_AGG(ur.role) as roles
       FROM profiles p
       JOIN user_roles ur ON ur.user_id = p.id
       WHERE ur.role IN ('admin', 'manager')
       GROUP BY p.id
       ORDER BY p.created_at DESC`
    );
  });

  // Create internal user (admin/manager)
  app.post('/api/admin/internal-users', {
    preHandler: [authMiddleware, requireRole('admin'), validateBody(z.object({
      email: z.string().email(),
      password: z.string().min(6),
      name: z.string().min(2),
      role: z.enum(['admin', 'manager']),
      phone: z.string().nullable().optional(),
    }))],
  }, async (request, reply) => {
    const body = request.body as { email: string; password: string; name: string; role: string; phone?: string | null };

    try {
      const user = await authService.createUserWithRole(
        body.email, body.password, body.name, body.role, undefined, body.phone
      );
      return reply.status(201).send(user);
    } catch (err: any) {
      logger.error({ err }, 'Error creating internal user');
      const msg = err.message || 'Erro ao criar usuário';
      // Clerk duplicate email error
      if (msg.includes('already exists') || msg.includes('duplicate') || err.status === 422) {
        return reply.status(409).send({ error: 'Este e-mail já está cadastrado' });
      }
      return reply.status(500).send({ error: msg });
    }
  });

  // Update internal user (activate/deactivate, change role)
  app.patch('/api/admin/internal-users/:userId', {
    preHandler: [authMiddleware, requireRole('admin')],
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const body = request.body as { is_active?: boolean; name?: string; role?: string };

    if (body.is_active !== undefined) {
      await query(`UPDATE profiles SET is_active = $1 WHERE id = $2`, [body.is_active, userId]);
    }
    if (body.name) {
      await query(`UPDATE profiles SET name = $1 WHERE id = $2`, [body.name, userId]);
    }
    if (body.role) {
      await query(`UPDATE user_roles SET role = $1 WHERE user_id = $2 AND role IN ('admin', 'manager')`, [body.role, userId]);
    }

    const updated = await queryOne(
      `SELECT p.id, p.name, p.email, p.is_active, ARRAY_AGG(ur.role) as roles
       FROM profiles p JOIN user_roles ur ON ur.user_id = p.id
       WHERE p.id = $1 GROUP BY p.id`,
      [userId]
    );

    return updated || reply.status(404).send({ error: 'Usuário não encontrado' });
  });
}
