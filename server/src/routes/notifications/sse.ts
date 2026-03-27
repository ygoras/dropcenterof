import type { FastifyInstance } from 'fastify';
import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import type { JwtPayload } from '../../middleware/auth.js';

const clients = new Map<string, { reply: import('fastify').FastifyReply; tenantId: string | null; userId: string }>();

let pgListenerInitialized = false;

async function initPgListener() {
  if (pgListenerInitialized) return;
  pgListenerInitialized = true;

  const client = await pool.connect();
  client.on('notification', (msg) => {
    if (!msg.payload) return;

    try {
      const data = JSON.parse(msg.payload);
      const { table, operation, tenant_id } = data;

      for (const [id, clientInfo] of clients) {
        // Send to matching tenant or admins (tenantId = null)
        if (clientInfo.tenantId === null || clientInfo.tenantId === tenant_id) {
          try {
            clientInfo.reply.raw.write(
              `data: ${JSON.stringify({ type: `${table}_${operation.toLowerCase()}`, table, operation, tenant_id })}\n\n`
            );
          } catch {
            clients.delete(id);
          }
        }
      }
    } catch (err) {
      logger.error(err, 'Error processing pg notification');
    }
  });

  await client.query('LISTEN table_changes');
  logger.info('PostgreSQL LISTEN/NOTIFY initialized for SSE');
}

export async function registerSSERoutes(app: FastifyInstance) {
  app.get('/api/events/stream', async (request, reply) => {
    // Auth via query param (EventSource doesn't support headers)
    const token = (request.query as { token?: string }).token;
    if (!token) {
      return reply.status(401).send({ error: 'Token obrigatório' });
    }

    let user: JwtPayload;
    try {
      user = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    } catch {
      return reply.status(401).send({ error: 'Token inválido' });
    }

    await initPgListener();

    const clientId = `${user.sub}-${Date.now()}`;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

    clients.set(clientId, { reply, tenantId: user.tenantId, userId: user.sub });

    // Heartbeat
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
        clients.delete(clientId);
      }
    }, 30000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(clientId);
    });
  });
}
