import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { env } from './config/env.js';
import { corsOptions } from './config/cors.js';
import { testConnection } from './config/database.js';
import { registerSecurityHeaders } from './middleware/securityHeaders.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './lib/logger.js';
import { registerAuthRoutes } from './routes/auth/index.js';
import { registerUserRoutes } from './routes/users/index.js';
import { registerMlRoutes } from './routes/ml/index.js';
import { registerPaymentRoutes } from './routes/payments/index.js';
import { registerProductRoutes } from './routes/products/index.js';
import { registerOrderRoutes } from './routes/orders/index.js';
import { registerStockRoutes } from './routes/stock/index.js';
import { registerNotificationRoutes } from './routes/notifications/index.js';
import { registerTicketRoutes } from './routes/tickets/index.js';
import { registerWalletRoutes } from './routes/wallet/index.js';
import { registerUploadRoutes } from './routes/upload/index.js';
import { registerAnalyticsRoutes } from './routes/analytics/index.js';
import { registerTenantRoutes } from './routes/tenants/index.js';
import { registerPlanRoutes } from './routes/plans/index.js';
import { registerSubscriptionRoutes } from './routes/subscriptions/index.js';
import { registerAuditRoutes } from './routes/audit/index.js';
import { registerSSERoutes } from './routes/notifications/sse.js';
import { startCronJobs } from './services/cronService.js';

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    redact: ['req.headers.authorization'],
  },
});

async function start() {
  // Plugins
  await app.register(cors, corsOptions);
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await registerSecurityHeaders(app);

  // Error handler
  app.setErrorHandler(errorHandler);

  // Health check
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Routes
  await registerAuthRoutes(app);
  await registerUserRoutes(app);
  await registerMlRoutes(app);
  await registerPaymentRoutes(app);
  await registerProductRoutes(app);
  await registerOrderRoutes(app);
  await registerStockRoutes(app);
  await registerNotificationRoutes(app);
  await registerTicketRoutes(app);
  await registerWalletRoutes(app);
  await registerUploadRoutes(app);
  await registerAnalyticsRoutes(app);
  await registerTenantRoutes(app);
  await registerPlanRoutes(app);
  await registerSubscriptionRoutes(app);
  await registerAuditRoutes(app);
  await registerSSERoutes(app);

  // Test DB connection
  try {
    await testConnection();
    logger.info('Database connection established');
  } catch (err) {
    logger.error(err, 'Failed to connect to database');
    process.exit(1);
  }

  // Start cron jobs
  startCronJobs();

  // Listen
  await app.listen({ port: env.APP_PORT, host: '0.0.0.0' });
  logger.info(`Server running on port ${env.APP_PORT}`);
}

start().catch((err) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});
