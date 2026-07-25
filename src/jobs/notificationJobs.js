import { processScheduledNotifications } from '../services/notificationService.js';

/**
 * Cron entry: process due scheduled push notifications.
 */
export async function runNotificationJobs() {
  return processScheduledNotifications();
}
