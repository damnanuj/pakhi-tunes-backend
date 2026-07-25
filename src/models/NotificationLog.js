import mongoose from 'mongoose';

const notificationLogSchema = new mongoose.Schema(
  {
    notificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notification',
      required: true,
      index: true,
    },
    batchIndex: {
      type: Number,
      required: true,
      default: 0,
    },
    totalInBatch: {
      type: Number,
      required: true,
      default: 0,
    },
    successCount: {
      type: Number,
      default: 0,
    },
    failureCount: {
      type: Number,
      default: 0,
    },
    failedTokens: {
      type: [String],
      default: [],
    },
    invalidTokens: {
      type: [String],
      default: [],
    },
    error: {
      type: String,
      default: null,
    },
    durationMs: {
      type: Number,
      default: null,
    },
    isRetry: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationLogSchema.index({ notificationId: 1, batchIndex: 1 });

notificationLogSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    notificationId: this.notificationId?.toString?.() ?? this.notificationId,
    batchIndex: this.batchIndex,
    totalInBatch: this.totalInBatch,
    successCount: this.successCount,
    failureCount: this.failureCount,
    failedTokens: this.failedTokens ?? [],
    invalidTokens: this.invalidTokens ?? [],
    error: this.error ?? null,
    durationMs: this.durationMs ?? null,
    isRetry: this.isRetry ?? false,
    createdAt: this.createdAt,
  };
};

export default mongoose.model('NotificationLog', notificationLogSchema);
