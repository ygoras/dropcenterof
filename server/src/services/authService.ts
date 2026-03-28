import { query, queryOne, transaction } from '../lib/db.js';
import { clerkClient } from '../middleware/auth.js';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  tenant_id: string | null;
  roles: string[];
  subscription_status?: string;
}

/**
 * Get user profile from the app database (not Clerk).
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const profile = await queryOne<{
    id: string;
    email: string;
    name: string;
    tenant_id: string | null;
  }>(
    `SELECT id, email, name, tenant_id FROM profiles WHERE id = $1`,
    [userId]
  );

  if (!profile) return null;

  const { rows: roleRows } = await query<{ role: string }>(
    `SELECT role FROM user_roles WHERE user_id = $1`,
    [userId]
  );

  const subscription = await queryOne<{ status: string }>(
    `SELECT status FROM subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [profile.tenant_id]
  );

  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.name,
    tenant_id: profile.tenant_id,
    roles: roleRows.map(r => r.role),
    subscription_status: subscription?.status,
  };
}

/**
 * Create app user from Clerk webhook (user.created event).
 * Creates auth_users + profiles + user_roles with 'seller' role.
 */
export async function createUserFromClerk(
  clerkUserId: string,
  email: string,
  fullName: string
): Promise<UserProfile> {
  return transaction(async (client) => {
    const { rows: [authUser] } = await client.query<{ id: string }>(
      `INSERT INTO auth_users (email, password_hash, clerk_user_id)
       VALUES ($1, 'clerk_managed', $2)
       RETURNING id`,
      [email.toLowerCase(), clerkUserId]
    );

    await client.query(
      `INSERT INTO profiles (id, email, name) VALUES ($1, $2, $3)`,
      [authUser.id, email.toLowerCase(), fullName]
    );

    await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'seller')`,
      [authUser.id]
    );

    return {
      id: authUser.id,
      email: email.toLowerCase(),
      full_name: fullName,
      tenant_id: null,
      roles: ['seller'],
    };
  });
}

/**
 * Create user with specific role (used by admin to create sellers/operators).
 * Creates user in Clerk first, then syncs to app database.
 */
export async function createUserWithRole(
  email: string,
  password: string,
  fullName: string,
  role: string,
  tenantId?: string,
  phone?: string | null
): Promise<UserProfile> {
  // Create user in Clerk
  const clerkUser = await clerkClient.users.createUser({
    emailAddress: [email],
    password,
    firstName: fullName.split(' ')[0],
    lastName: fullName.split(' ').slice(1).join(' ') || undefined,
  });

  return transaction(async (client) => {
    const { rows: [authUser] } = await client.query<{ id: string }>(
      `INSERT INTO auth_users (email, password_hash, clerk_user_id)
       VALUES ($1, 'clerk_managed', $2)
       RETURNING id`,
      [email.toLowerCase(), clerkUser.id]
    );

    await client.query(
      `INSERT INTO profiles (id, email, name, tenant_id, phone) VALUES ($1, $2, $3, $4, $5)`,
      [authUser.id, email.toLowerCase(), fullName, tenantId ?? null, phone ?? null]
    );

    await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`,
      [authUser.id, role]
    );

    return {
      id: authUser.id,
      email: email.toLowerCase(),
      full_name: fullName,
      tenant_id: tenantId ?? null,
      roles: [role],
    };
  });
}
