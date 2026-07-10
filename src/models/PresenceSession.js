import mongoose from 'mongoose';

const presenceSessionSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, trim: true, index: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    platform: {
      type: String,
      enum: ['ios', 'android', 'web'],
      default: 'android',
    },
    appVersion: { type: String, default: '', trim: true },
    startedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now, index: true },
    endedAt: { type: Date, default: null },
    durationMs: { type: Number, default: 0, min: 0 },
    dayKey: { type: String, required: true, trim: true, index: true },
  },
  { timestamps: true }
);

presenceSessionSchema.index({ deviceId: 1, endedAt: 1 });
presenceSessionSchema.index({ endedAt: 1, lastSeenAt: 1 });

presenceSessionSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    deviceId: this.deviceId,
    userId: this.userId?.toString?.() ?? null,
    platform: this.platform,
    appVersion: this.appVersion ?? '',
    startedAt: this.startedAt?.toISOString?.() ?? this.startedAt,
    lastSeenAt: this.lastSeenAt?.toISOString?.() ?? this.lastSeenAt,
    endedAt: this.endedAt?.toISOString?.() ?? null,
    durationMs: this.durationMs ?? 0,
    dayKey: this.dayKey,
  };
};

export default mongoose.model('PresenceSession', presenceSessionSchema);
