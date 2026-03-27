import type { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema, ZodError } from 'zod';

export function validateBody<T>(schema: ZodSchema<T>) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      request.body = schema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({
          error: 'Dados inválidos',
          details: err.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      throw err;
    }
  };
}
