import type { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';

export async function registerSecurityHeaders(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://clerk.dropcenter.com.br"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", "https://clerk.dropcenter.com.br", "https://contas.dropcenter.com.br"],
        fontSrc: ["'self'"],
        objectSrc: ["blob:"],
        frameSrc: ["'self'", "blob:"],
        frameAncestors: ["'none'"],
        workerSrc: ["'self'", "blob:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
    crossOriginEmbedderPolicy: false,
  });
}
