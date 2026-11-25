import mongoose from 'mongoose';

/**
 * One row per lockout key: `acct:<email>` or `ip:<address>`.
 * Documents expire via the TTL index on expiresAt.
 */
const loginLockoutSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    failures: { type: Number, default: 0 },
    failuresWindowStart: { type: Date, default: null },
    strikes: { type: Number, default: 0 },
    lastStrikeAt: { type: Date, default: null },
    lockedUntil: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { versionKey: false }
);

loginLockoutSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('LoginLockout', loginLockoutSchema);
