import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../lib/logger.js';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  logger.error({
    err: error,
    method: request.method,
    url: request.url,
    userId: request.user?.sub,
  }, 'Request error');

  if (error.statusCode && error.statusCode < 500) {
    reply.status(error.statusCode).send({
      error: error.message,
    });
    return;
  }

  reply.status(500).send({
    error: 'Erro interno do servidor',
  });
}
