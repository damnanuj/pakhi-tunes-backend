import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema(
  {
    installationId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    fcmToken: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    platform: {
      type: String,
      enum: ['android', 'ios', 'web'],
      default: 'android',
      index: true,
    },
    deviceModel: {
      type: String,
      default: '',
      trim: true,
    },
    appVersion: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

deviceSchema.index({ status: 1, platform: 1 });
deviceSchema.index({ status: 1, userId: 1 });

deviceSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    installationId: this.installationId,
    fcmToken: this.fcmToken,
    userId: this.userId?.toString?.() ?? null,
    platform: this.platform,
    deviceModel: this.deviceModel ?? '',
    appVersion: this.appVersion ?? '',
    status: this.status,
    lastActiveAt: this.lastActiveAt?.toISOString?.() ?? this.lastActiveAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('Device', deviceSchema);
