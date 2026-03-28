import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { query } from '../../lib/db.js';
import { hmacSha256, verifyHmac } from '../../lib/crypto.js';
import { authMiddleware } from '../../middleware/auth.js';
import { logger } from '../../lib/logger.js';

const ML_AUTH_URL = 'https://auth.mercadolivre.com.br/authorization';
const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';

function buildSuccessPage(displayName: string, appUrl: string): string {
  const escapedName = displayName
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const escapedOrigin = appUrl
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const parts: string[] = [];
  parts.push('<!DOCTYPE html>');
  parts.push('<html lang="pt-BR"><head><meta charset="UTF-8">');
  parts.push('<meta name="viewport" content="width=device-width,initial-scale=1.0">');
  parts.push('<title>Conta Conectada</title>');
  parts.push('<style>');
  parts.push('*{margin:0;padding:0;box-sizing:border-box}');
  parts.push('body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f1729;color:#e2e8f0}');
  parts.push('.c{text-align:center;background:#1a2332;padding:48px 40px;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.4);border:1px solid rgba(99,102,241,.2);max-width:420px;width:90%}');
  parts.push('.i{font-size:56px;margin-bottom:20px}');
  parts.push('h1{font-size:22px;font-weight:700;color:#f1f5f9;margin-bottom:8px}');
  parts.push('.n{display:inline-block;background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);border-radius:8px;padding:8px 16px;margin:12px 0;font-weight:600;color:#a5b4fc;font-size:15px}');
  parts.push('.s{color:#94a3b8;font-size:14px;margin-top:16px}');
  parts.push('</style></head><body>');
  parts.push('<div class="c">');
  parts.push('<div class="i">&#127881;</div>');
  parts.push('<h1>Conta conectada com sucesso!</h1>');
  parts.push(`<div class="n">${escapedName}</div>`);
  parts.push('<p class="s">Voc&#234; j&#225; pode fechar esta aba.</p>');
  parts.push('</div>');
  parts.push('<script>');
  parts.push(`try{if(window.opener){window.opener.postMessage({type:"ML_OAUTH_SUCCESS"},"${escapedOrigin}")}}catch(e){}`);
  parts.push('try{window.close()}catch(e){}');
  parts.push('</script>');
  parts.push('</body></html>');
  return parts.join('');
}

function signState(tenantId: string, userId: string): string {
  const timestamp = String(Date.now());
  const data = `${tenantId}|${userId}|${timestamp}`;
  const hmac = hmacSha256(data, env.JWT_SECRET);
  return `${tenantId}|${userId}|${timestamp}|${hmac}`;
}

function parseAndVerifyState(state: string): { tenantId: string; userId: string } | null {
  const parts = state.split('|');
  if (parts.length !== 4) return null;

  const [tenantId, userId, timestamp, signature] = parts;
  if (!tenantId || !userId || !timestamp || !signature) return null;

  const data = `${tenantId}|${userId}|${timestamp}`;
  try {
    if (!verifyHmac(data, signature, env.JWT_SECRET)) return null;
  } catch {
    return null;
  }

  // Reject states older than 30 minutes
  const age = Date.now() - Number(timestamp);
  if (age > 30 * 60 * 1000 || age < 0) return null;

  return { tenantId, userId };
}

export async function registerMlOAuthRoutes(app: FastifyInstance) {
  const redirectUri = env.APP_URL + '/api/ml/callback';

  // ─── Start OAuth flow (authenticated) ───────────────────────────────
  app.post('/api/ml/oauth', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const body = request.body as { tenant_id?: string; user_id?: string; app_url?: string } | null;

    if (!body?.tenant_id || !body?.user_id) {
      return reply.status(400).send({ error: 'tenant_id e user_id são obrigatórios' });
    }

    if (!env.ML_APP_ID || !env.ML_CLIENT_SECRET) {
      return reply.status(500).send({ error: 'ML credentials not configured' });
    }

    const stateParam = signState(body.tenant_id, body.user_id);
    const authUrl =
      ML_AUTH_URL +
      '?response_type=code&client_id=' + env.ML_APP_ID +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&state=' + encodeURIComponent(stateParam) +
      '&scope=offline_access';

    return reply.send({ auth_url: authUrl });
  });

  // ─── OAuth callback from ML (no auth) ──────────────────────────────
  app.get('/api/ml/callback', async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };

    if (!code || !state) {
      return reply.status(400).type('text/html; charset=utf-8').send('<h1>Erro: code ou state ausente</h1>');
    }

    if (!env.ML_APP_ID || !env.ML_CLIENT_SECRET) {
      return reply.status(500).type('text/html; charset=utf-8').send('<h1>Erro: ML credentials not configured</h1>');
    }

    const verified = parseAndVerifyState(state);
    if (!verified) {
      return reply.status(400).type('text/html; charset=utf-8').send('<h1>Erro: state inválido ou expirado</h1>');
    }

    const { tenantId, userId } = verified;

    try {
      // Exchange authorization code for access token
      const tokenResponse = await fetch(ML_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: env.ML_APP_ID,
          client_secret: env.ML_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
        }),
      });

      const tokenData: any = await tokenResponse.json();

      if (!tokenResponse.ok) {
        logger.error({ status: tokenResponse.status }, 'ML token exchange failed');
        return reply.status(400).type('text/html; charset=utf-8').send('<h1>Erro ao obter token do Mercado Livre</h1>');
      }

      const { access_token, refresh_token, expires_in, user_id: mlUserId } = tokenData;

      if (!refresh_token) {
        logger.error('ML did not return refresh_token');
        return reply
          .status(400)
          .type('text/html; charset=utf-8')
          .send('<h1>Erro: refresh_token ausente</h1><p>Verifique se o escopo offline_access está habilitado.</p>');
      }

      // Fetch ML user info for nickname
      const userInfoRes = await fetch(`https://api.mercadolibre.com/users/${mlUserId}`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const userInfo: any = await userInfoRes.json();
      const mlNickname: string | null = userInfo.nickname || null;

      // Save credentials to database
      const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

      await query(
        `INSERT INTO ml_credentials (tenant_id, user_id, access_token, refresh_token, expires_at, ml_user_id, ml_nickname, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (tenant_id, ml_user_id) DO UPDATE SET
         access_token = $3, refresh_token = $4, expires_at = $5, ml_nickname = $7, updated_at = NOW()`,
        [tenantId, userId, access_token, refresh_token, expiresAt, String(mlUserId), mlNickname]
      );

      logger.info({ tenantId, mlUserId }, 'ML OAuth credentials saved');

      // Register webhook subscriptions so ML sends notifications automatically
      try {
        const webhookUrl = env.APP_URL + '/api/webhooks/ml';
        const webhookRes = await fetch(`https://api.mercadolibre.com/applications/${env.ML_APP_ID}/webhooks`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            callback_url: webhookUrl,
            topics: ['items', 'orders_v2', 'shipments', 'questions'],
          }),
        });
        const webhookData: any = await webhookRes.json();
        logger.info({ status: webhookRes.status, topics: webhookData?.topics, tenantId }, 'ML webhook subscription registered');
      } catch (webhookErr) {
        logger.warn({ err: webhookErr, tenantId }, 'Failed to register ML webhook subscription (non-blocking)');
      }

      // Return success HTML page
      const displayName = mlNickname || String(mlUserId);
      const html = buildSuccessPage(displayName, env.APP_URL);

      return reply.type('text/html; charset=utf-8').send(html);
    } catch (err) {
      logger.error({ err }, 'ML OAuth callback error');
      return reply.status(500).type('text/html; charset=utf-8').send('<h1>Erro interno ao processar OAuth</h1>');
    }
  });
}
