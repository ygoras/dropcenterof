import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query, queryOne, transaction } from '../lib/db.js';
import { sha256, generateSecureToken } from '../lib/crypto.js';
import type { JwtPayload } from '../middleware/auth.js';

const BCRYPT_ROUNDS = 12;

interface AuthUser {
  id: string;
  email: string;
  password_hash: string;
  email_verified: boolean;
  user_metadata: Record<string, unknown>;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string; // mapped from profiles.name column
  tenant_id: string | null;
  roles: string[];
  subscription_status?: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload as object, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRY as any });
}

export function generateRefreshToken(): string {
  return generateSecureToken(48);
}

export async function storeRefreshToken(userId: string, token: string, deviceInfo?: Record<string, unknown>): Promise<void> {
  const tokenHash = sha256(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await query(
    `INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at, device_info)
     VALUES ($1, $2, $3, $4)`,
    [userId, tokenHash, expiresAt, JSON.stringify(deviceInfo ?? {})]
  );
}

export async function validateRefreshToken(token: string): Promise<string | null> {
  const tokenHash = sha256(token);
  const result = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM auth_refresh_tokens
     WHERE token_hash = $1 AND expires_at > NOW() AND revoked_at IS NULL`,
    [tokenHash]
  );
  return result?.user_id ?? null;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const tokenHash = sha256(token);
  await query(
    `UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
    [tokenHash]
  );
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await query(
    `UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

export async function login(email: string, password: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
} | null> {
  const user = await queryOne<AuthUser>(
    `SELECT id, email, password_hash, email_verified, user_metadata FROM auth_users WHERE email = $1`,
    [email.toLowerCase()]
  );

  if (!user) return null;

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return null;

  const profile = await getUserProfile(user.id);
  if (!profile) return null;

  const accessToken = generateAccessToken({
    sub: profile.id,
    email: profile.email,
    roles: profile.roles,
    tenantId: profile.tenant_id,
  });

  const refreshToken = generateRefreshToken();
  await storeRefreshToken(user.id, refreshToken);

  return { accessToken, refreshToken, user: profile };
}

export async function register(
  email: string,
  password: string,
  fullName: string,
  tenantId?: string
): Promise<{ accessToken: string; refreshToken: string; user: UserProfile }> {
  const passwordHash = await hashPassword(password);

  return transaction(async (client) => {
    const { rows: [authUser] } = await client.query<{ id: string }>(
      `INSERT INTO auth_users (email, password_hash) VALUES ($1, $2) RETURNING id`,
      [email.toLowerCase(), passwordHash]
    );

    await client.query(
      `INSERT INTO profiles (id, email, name, tenant_id) VALUES ($1, $2, $3, $4)`,
      [authUser.id, email.toLowerCase(), fullName, tenantId ?? null]
    );

    await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`,
      [authUser.id, 'seller']
    );

    // Build profile inline (transaction not yet committed, pool queries can't see the data)
    const profile: UserProfile = {
      id: authUser.id,
      email: email.toLowerCase(),
      name: fullName,
      tenant_id: tenantId ?? null,
      roles: ['seller'],
      subscription_status: null,
    };

    const accessToken = generateAccessToken({
      sub: profile.id,
      email: profile.email,
      roles: profile.roles,
      tenantId: profile.tenant_id,
    });

    const refreshToken = generateRefreshToken();
    const tokenHash = sha256(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await client.query(
      `INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at, device_info) VALUES ($1, $2, $3, '{}')`,
      [authUser.id, tokenHash, expiresAt]
    );

    return { accessToken, refreshToken, user: profile };
  });
}

export async function refreshTokens(oldRefreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  const userId = await validateRefreshToken(oldRefreshToken);
  if (!userId) return null;

  await revokeRefreshToken(oldRefreshToken);

  const profile = await getUserProfile(userId);
  if (!profile) return null;

  const accessToken = generateAccessToken({
    sub: profile.id,
    email: profile.email,
    roles: profile.roles,
    tenantId: profile.tenant_id,
  });

  const newRefreshToken = generateRefreshToken();
  await storeRefreshToken(userId, newRefreshToken);

  return { accessToken, refreshToken: newRefreshToken };
}

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

export async function createUserWithRole(
  email: string,
  password: string,
  fullName: string,
  role: string,
  tenantId?: string,
  phone?: string | null
): Promise<UserProfile> {
  const passwordHash = await hashPassword(password);

  return transaction(async (client) => {
    const { rows: [authUser] } = await client.query<{ id: string }>(
      `INSERT INTO auth_users (email, password_hash) VALUES ($1, $2) RETURNING id`,
      [email.toLowerCase(), passwordHash]
    );

    await client.query(
      `INSERT INTO profiles (id, email, name, tenant_id, phone) VALUES ($1, $2, $3, $4, $5)`,
      [authUser.id, email.toLowerCase(), fullName, tenantId ?? null, phone ?? null]
    );

    await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`,
      [authUser.id, role]
    );

    // Build profile from transaction client (data not yet committed, so pool queries can't see it)
    return {
      id: authUser.id,
      email: email.toLowerCase(),
      name: fullName,
      tenant_id: tenantId ?? null,
      roles: [role],
      subscription_status: null,
    };
  });
}
