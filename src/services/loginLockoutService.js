import LoginLockout from '../models/LoginLockout.js';

/**
 * Escalating login lockout.
 *
 * - Only failed password attempts count (wrong password, unknown email).
 * - Failures are tracked per account and per IP as two independent keys.
 *   A lock on either key blocks the login.
 * - After 5 failures (account) or 20 failures (IP) within FAILURE_WINDOW_MS, the
 *   key is locked. Each repeat lock doubles the duration: 15m, 30m, 60m (capped).
 * - Strikes reset after STRIKE_FORGIVE_MS with no new lock.
 * - A successful login clears the account's counters.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// The account bucket is strict: one person mistyping a password rarely fails
// more than a few times. The IP bucket is looser, because mobile carriers put
// many users behind one IP and a strict IP limit would lock all of them out.
// It still stops one source from guessing across many accounts.
export const LOGIN_ACCOUNT_FAILURE_THRESHOLD = 5;
export const LOGIN_IP_FAILURE_THRESHOLD = 20;

function failureThreshold(key) {
  return key.startsWith('ip:') ? LOGIN_IP_FAILURE_THRESHOLD : LOGIN_ACCOUNT_FAILURE_THRESHOLD;
}
const FAILURE_WINDOW_MS = 15 * MINUTE;
const BASE_LOCK_MS = 15 * MINUTE;
const MAX_LOCK_MS = 60 * MINUTE;
const STRIKE_FORGIVE_MS = 24 * HOUR;
const RECORD_TTL_MS = 24 * HOUR;

export function lockDurationMs(strikes) {
  return Math.min(BASE_LOCK_MS * 2 ** (strikes - 1), MAX_LOCK_MS);
}

export function lockoutKeys(email, ip) {
  const keys = [];
  if (email) keys.push(`acct:${email}`);
  if (ip) keys.push(`ip:${ip}`);
  return keys;
}

/** Seconds until a login may be attempted again, or 0 when allowed. */
export async function loginRetryAfterSeconds(email, ip, now = new Date()) {
  const keys = lockoutKeys(email, ip);
  if (keys.length === 0) return 0;

  const locks = await LoginLockout.find({
    key: { $in: keys },
    lockedUntil: { $gt: now },
  })
    .select('lockedUntil')
    .lean();

  if (locks.length === 0) return 0;

  const latest = Math.max(...locks.map((lock) => new Date(lock.lockedUntil).getTime()));
  return Math.max(1, Math.ceil((latest - now.getTime()) / 1000));
}

async function registerFailure(key, now) {
  const doc = await LoginLockout.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, failures: 0, strikes: 0 } },
    { upsert: true, new: true }
  );

  if (!doc.failuresWindowStart || now - doc.failuresWindowStart > FAILURE_WINDOW_MS) {
    doc.failures = 0;
    doc.failuresWindowStart = now;
  }

  if (doc.lastStrikeAt && now - doc.lastStrikeAt > STRIKE_FORGIVE_MS) {
    doc.strikes = 0;
  }

  doc.failures += 1;

  if (doc.failures >= failureThreshold(key)) {
    doc.strikes += 1;
    doc.lockedUntil = new Date(now.getTime() + lockDurationMs(doc.strikes));
    doc.lastStrikeAt = now;
    doc.failures = 0;
    doc.failuresWindowStart = null;
  }

  doc.expiresAt = new Date(now.getTime() + RECORD_TTL_MS);
  await doc.save();
}

export async function recordLoginFailure(email, ip, now = new Date()) {
  for (const key of lockoutKeys(email, ip)) {
    await registerFailure(key, now);
  }
}

export async function clearAccountLockout(email) {
  if (!email) return;
  await LoginLockout.deleteOne({ key: `acct:${email}` });
}
