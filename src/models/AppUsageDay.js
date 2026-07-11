import mongoose from 'mongoose';

const appUsageDaySchema = new mongoose.Schema(
  {
    dayKey: { type: String, required: true, unique: true, trim: true, index: true },
    peakLiveCount: { type: Number, default: 0, min: 0 },
    peakAt: { type: Date, default: null },
    totalSessions: { type: Number, default: 0, min: 0 },
    totalDurationMs: { type: Number, default: 0, min: 0 },
    uniqueDevices: { type: Number, default: 0, min: 0 },
    deviceIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

appUsageDaySchema.methods.toSafeObject = function toSafeObject() {
  return {
    dayKey: this.dayKey,
    peakLiveCount: this.peakLiveCount ?? 0,
    peakAt: this.peakAt?.toISOString?.() ?? null,
    totalSessions: this.totalSessions ?? 0,
    totalDurationMs: this.totalDurationMs ?? 0,
    uniqueDevices: this.uniqueDevices ?? 0,
  };
};

export default mongoose.model('AppUsageDay', appUsageDaySchema);
