import mongoose from 'mongoose';

const guestSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, trim: true, index: true },
    platform: {
      type: String,
      enum: ['ios', 'android', 'web'],
      default: 'android',
    },
    appVersion: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['active', 'inactive', 'converted', 'banned'],
      default: 'active',
      index: true,
    },
    convertedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    convertedAt: { type: Date, default: null },
    lastActiveAt: { type: Date, default: Date.now, index: true },
    totalListenedMs: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

guestSchema.index({ status: 1, convertedUserId: 1 });
guestSchema.index({ createdAt: 1 });
guestSchema.index({ convertedAt: 1 });

guestSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    deviceId: this.deviceId,
    platform: this.platform,
    appVersion: this.appVersion ?? '',
    status: this.status,
    convertedUserId: this.convertedUserId?.toString?.() ?? null,
    convertedAt: this.convertedAt?.toISOString?.() ?? null,
    lastActiveAt: this.lastActiveAt?.toISOString?.() ?? this.lastActiveAt,
    totalListenedMs: this.totalListenedMs ?? 0,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('Guest', guestSchema);
