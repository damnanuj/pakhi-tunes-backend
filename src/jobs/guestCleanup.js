import Guest from '../models/Guest.js';

const INACTIVITY_DAYS = Number(process.env.GUEST_INACTIVITY_DAYS) || 60;

export async function cleanupInactiveGuests() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INACTIVITY_DAYS);

  const result = await Guest.updateMany(
    {
      status: 'active',
      lastActiveAt: { $lt: cutoff },
    },
    {
      $set: { status: 'inactive' },
    }
  );

  return {
    matched: result.matchedCount ?? result.n ?? 0,
    modified: result.modifiedCount ?? result.nModified ?? 0,
    cutoff: cutoff.toISOString(),
    inactivityDays: INACTIVITY_DAYS,
  };
}
