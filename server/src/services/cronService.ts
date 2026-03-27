import cron from 'node-cron';
import { logger } from '../lib/logger.js';

// These will be populated once the ML and Asaas services are implemented
export function startCronJobs(): void {
  // Refresh ML tokens every 20 minutes
  cron.schedule('*/20 * * * *', async () => {
    try {
      const { refreshExpiringTokens } = await import('./mlService.js');
      await refreshExpiringTokens();
      logger.info('ML token refresh cron completed');
    } catch (err) {
      logger.error(err, 'ML token refresh cron failed');
    }
  });

  // Billing cron daily at 08:00
  cron.schedule('0 8 * * *', async () => {
    try {
      const { runBillingCron } = await import('./asaasService.js');
      await runBillingCron();
      logger.info('Billing cron completed');
    } catch (err) {
      logger.error(err, 'Billing cron failed');
    }
  });

  logger.info('Cron jobs started: ML token refresh (*/20min), Billing (daily 08:00)');
}
