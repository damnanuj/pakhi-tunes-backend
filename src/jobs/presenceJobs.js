import {
  closeStalePresenceSessions,
  sampleLivePeakForToday,
} from '../services/presenceService.js';

export async function runPresenceMinuteJobs() {
  const stale = await closeStalePresenceSessions();
  const peak = await sampleLivePeakForToday();
  return { stale, peak };
}

export { closeStalePresenceSessions, sampleLivePeakForToday };
