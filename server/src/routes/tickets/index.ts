import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validateBody.js';
import { queryMany, queryOne, query } from '../../lib/db.js';
import { getTenantFilter } from '../../middleware/tenantScope.js';

const createTicketSchema = z.object({
  subject: z.string().min(1),
  message: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

const createMessageSchema = z.object({
  message: z.string().min(1),
});

export async function registerTicketRoutes(app: FastifyInstance) {
  app.get('/api/tickets', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { tenantId, isAdmin } = getTenantFilter(request);
    const params: unknown[] = [];
    let tenantWhere = '';

    if (!isAdmin && tenantId) {
      params.push(tenantId);
      tenantWhere = `WHERE t.tenant_id = $${params.length}`;
    }

    return queryMany(
      `SELECT t.*, p.full_name as created_by_name
       FROM support_tickets t
       LEFT JOIN profiles p ON p.id = t.created_by
       ${tenantWhere}
       ORDER BY t.updated_at DESC`,
      params
    );
  });

  app.post('/api/tickets', {
    preHandler: [authMiddleware, validateBody(createTicketSchema)],
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof createTicketSchema>;
    const userId = request.user.sub;
    const tenantId = request.user.tenantId;

    const ticket = await queryOne(
      `INSERT INTO support_tickets (subject, priority, status, tenant_id, created_by)
       VALUES ($1, $2, 'open', $3, $4) RETURNING *`,
      [body.subject, body.priority, tenantId, userId]
    );

    if (ticket) {
      await query(
        `INSERT INTO support_messages (ticket_id, sender_id, message)
         VALUES ($1, $2, $3)`,
        [(ticket as { id: string }).id, userId, body.message]
      );
    }

    return reply.status(201).send(ticket);
  });

  app.get('/api/tickets/:ticketId/messages', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { ticketId } = request.params as { ticketId: string };
    return queryMany(
      `SELECT m.*, p.full_name as sender_name
       FROM support_messages m
       LEFT JOIN profiles p ON p.id = m.sender_id
       WHERE m.ticket_id = $1
       ORDER BY m.created_at ASC`,
      [ticketId]
    );
  });

  app.post('/api/tickets/:ticketId/messages', {
    preHandler: [authMiddleware, validateBody(createMessageSchema)],
  }, async (request, reply) => {
    const { ticketId } = request.params as { ticketId: string };
    const { message } = request.body as z.infer<typeof createMessageSchema>;
    const userId = request.user.sub;

    const msg = await queryOne(
      `INSERT INTO support_messages (ticket_id, sender_id, message)
       VALUES ($1, $2, $3) RETURNING *`,
      [ticketId, userId, message]
    );

    await query(
      `UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`,
      [ticketId]
    );

    return reply.status(201).send(msg);
  });

  app.patch('/api/tickets/:ticketId/status', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { ticketId } = request.params as { ticketId: string };
    const { status } = request.body as { status: string };

    const ticket = await queryOne(
      `UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, ticketId]
    );

    if (!ticket) return reply.status(404).send({ error: 'Ticket não encontrado' });
    return ticket;
  });
}
