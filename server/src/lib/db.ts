import { pool } from '../config/database.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { QueryResult, QueryResultRow, PoolClient } from 'pg';

// RLS context stored per-request via AsyncLocalStorage
interface RlsContext {
  tenantId: string | null;
  isAdmin: boolean;
}

export const rlsStorage = new AsyncLocalStorage<RlsContext>();

/**
 * Execute a query with RLS context automatically applied.
 * Uses a dedicated connection from the pool, sets session vars, runs query, releases.
 */
async function queryWithRls<T extends QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const ctx = rlsStorage.getStore();

  // If no RLS context (e.g. cron jobs, migrations), use pool directly
  if (!ctx) {
    return pool.query<T>(text, params);
  }

  const client = await pool.connect();
  try {
    // SET LOCAL only works inside a transaction
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.tenant_id = $1`, [ctx.tenantId || '']);
    await client.query(`SET LOCAL app.is_admin = $1`, [ctx.isAdmin ? 'true' : 'false']);
    const result = await client.query<T>(text, params);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return queryWithRls<T>(text, params);
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await queryWithRls<T>(text, params);
  return result.rows[0] ?? null;
}

export async function queryMany<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await queryWithRls<T>(text, params);
  return result.rows;
}

export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const ctx = rlsStorage.getStore();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Set RLS context inside transaction
    if (ctx) {
      await client.query(`SET LOCAL app.tenant_id = $1`, [ctx.tenantId || '']);
      await client.query(`SET LOCAL app.is_admin = $1`, [ctx.isAdmin ? 'true' : 'false']);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export { pool };
