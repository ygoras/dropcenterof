import { env } from '../config/env.js';
import { query, queryOne, queryMany } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { checkMissedFeeds } from '../routes/ml/webhook.js';

const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';

export async function refreshExpiringTokens(): Promise<void> {
  const threshold = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const expiring = await queryMany<{
    id: string;
    tenant_id: string;
    ml_user_id: string;
    refresh_token: string;
    store_name: string | null;
    ml_nickname: string | null;
  }>(
    `SELECT id, tenant_id, ml_user_id, refresh_token, store_name, ml_nickname
     FROM ml_credentials
     WHERE expires_at < $1`,
    [threshold]
  );

  if (expiring.length === 0) {
    logger.info('No ML tokens to refresh');
    return;
  }

  let refreshed = 0;

  for (const cred of expiring) {
    try {
      const tokenRes = await fetch(ML_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: env.ML_APP_ID,
          client_secret: env.ML_CLIENT_SECRET,
          refresh_token: cred.refresh_token,
        }),
      });

      const tokenData: any = await tokenRes.json();

      if (!tokenRes.ok) {
        logger.error({ credId: cred.id, tenantId: cred.tenant_id }, 'ML token refresh failed');
        continue;
      }

      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

      await query(
        `UPDATE ml_credentials
         SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW()
         WHERE id = $4`,
        [tokenData.access_token, tokenData.refresh_token, expiresAt, cred.id]
      );

      refreshed++;
      logger.info({ credId: cred.id, tenantId: cred.tenant_id }, 'ML token refreshed');

      // Check for missed webhook feeds after token refresh
      await checkMissedFeeds();
    } catch (err) {
      logger.error({ err, credId: cred.id }, 'Error refreshing ML credential');
    }
  }

  logger.info({ refreshed, total: expiring.length }, 'ML token refresh cycle complete');
}
