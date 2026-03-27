import type { FastifyInstance } from 'fastify';
import { registerMlOAuthRoutes } from './oauth.js';
import { registerMlWebhookRoutes } from './webhook.js';
import { registerMlSyncRoutes } from './sync.js';
import { registerMlCategoryRoutes } from './categories.js';
import { registerMlMiscRoutes } from './misc.js';
import { registerMlCrudRoutes } from './crud.js';

export async function registerMlRoutes(app: FastifyInstance) {
  await registerMlOAuthRoutes(app);
  await registerMlWebhookRoutes(app);
  await registerMlSyncRoutes(app);
  await registerMlCategoryRoutes(app);
  await registerMlMiscRoutes(app);
  await registerMlCrudRoutes(app);
}
