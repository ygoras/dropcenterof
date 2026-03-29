import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { queryMany, queryOne, query } from '../../lib/db.js';

export async function registerPickingRoutes(app: FastifyInstance) {
  // List picking tasks
  app.get('/api/picking-tasks', {
    preHandler: [authMiddleware, requireRole('admin', 'manager', 'operator')],
  }, async (request) => {
    const { finished, fields } = request.query as { finished?: string; fields?: string };

    let selectFields = 'pt.*, o.order_number, o.status as order_status, p.name as operator_name';
    if (fields) {
      const allowed = ['id', 'order_id', 'operator_id', 'status', 'started_at', 'completed_at', 'created_at'];
      const requested = fields.split(',').map(f => f.trim()).filter(f => allowed.includes(f));
      if (requested.length > 0) {
        selectFields = requested.map(f => `pt.${f}`).join(', ');
      }
    }

    let where = '';
    if (finished === 'true') {
      where = "WHERE pt.status = 'completed'";
    }

    return queryMany(
      `SELECT ${selectFields}
       FROM picking_tasks pt
       LEFT JOIN orders o ON o.id = pt.order_id
       LEFT JOIN profiles p ON p.id = pt.operator_id
       ${where}
       ORDER BY pt.created_at DESC`,
    );
  });

  // Create picking task
  app.post('/api/picking-tasks', {
    preHandler: [authMiddleware, requireRole('admin', 'manager', 'operator')],
  }, async (request, reply) => {
    const { order_id, operator_id } = request.body as { order_id: string; operator_id?: string };

    const task = await queryOne(
      `INSERT INTO picking_tasks (order_id, operator_id, status, started_at)
       VALUES ($1, $2, 'in_progress', NOW()) RETURNING *`,
      [order_id, operator_id || request.user.sub]
    );

    return reply.status(201).send(task);
  });

  // Update picking task by order ID
  app.patch('/api/picking-tasks/by-order/:orderId', {
    preHandler: [authMiddleware, requireRole('admin', 'manager', 'operator')],
  }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const { status, completed_at } = request.body as { status?: string; completed_at?: string };

    const sets: string[] = [];
    const params: unknown[] = [];

    if (status) { params.push(status); sets.push(`status = $${params.length}`); }
    if (completed_at) { params.push(completed_at); sets.push(`completed_at = $${params.length}`); }

    if (sets.length === 0) return reply.send({ success: true });

    params.push(orderId);
    const task = await queryOne(
      `UPDATE picking_tasks SET ${sets.join(', ')} WHERE order_id = $${params.length} RETURNING *`,
      params
    );

    if (!task) return reply.status(404).send({ error: 'Picking task não encontrada' });
    return task;
  });

  // Update picking task by ID
  app.patch('/api/picking-tasks/:taskId', {
    preHandler: [authMiddleware, requireRole('admin', 'manager', 'operator')],
  }, async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const { status, operator_id, started_at, completed_at } = request.body as {
      status?: string; operator_id?: string; started_at?: string; completed_at?: string;
    };

    const sets: string[] = [];
    const params: unknown[] = [];

    if (status) { params.push(status); sets.push(`status = $${params.length}`); }
    if (operator_id) { params.push(operator_id); sets.push(`operator_id = $${params.length}`); }
    if (started_at) { params.push(started_at); sets.push(`started_at = $${params.length}`); }
    if (completed_at) { params.push(completed_at); sets.push(`completed_at = $${params.length}`); }

    if (sets.length === 0) return reply.send({ success: true });

    params.push(taskId);
    const task = await queryOne(
      `UPDATE picking_tasks SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (!task) return reply.status(404).send({ error: 'Picking task não encontrada' });
    return task;
  });
}
