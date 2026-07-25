import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'general',
  'song',
  'album',
  'playlist',
  'artist',
  'genre',
  'promotion',
  'announcement',
  'feature_launch',
];

export const ACTION_TYPES = [
  'open_app',
  'navigate',
  'play_song',
  'open_album',
  'open_playlist',
  'open_artist',
  'open_url',
];

export const AUDIENCE_TYPES = [
  'all',
  'logged_in',
  'guests',
  'single_user',
  'multiple_users',
  'segment',
];

export const NOTIFICATION_STATUSES = [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'failed',
  'cancelled',
];

const audienceSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: AUDIENCE_TYPES,
      required: true,
      default: 'all',
    },
    userIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    filters: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false }
);

const statsSchema = new mongoose.Schema(
  {
    totalTargets: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
  },
  { _id: false }
);

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    imageUrl: {
      type: String,
      default: null,
      trim: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
      default: 'general',
      index: true,
    },
    actionType: {
      type: String,
      enum: ACTION_TYPES,
      required: true,
      default: 'open_app',
    },
    actionPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    audience: {
      type: audienceSchema,
      required: true,
      default: () => ({ type: 'all', userIds: [], filters: null }),
    },
    priority: {
      type: String,
      enum: ['normal', 'high'],
      default: 'normal',
    },
    status: {
      type: String,
      enum: NOTIFICATION_STATUSES,
      default: 'draft',
      index: true,
    },
    scheduledAt: {
      type: Date,
      default: null,
      index: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    stats: {
      type: statsSchema,
      default: () => ({
        totalTargets: 0,
        sent: 0,
        failed: 0,
        delivered: 0,
      }),
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

notificationSchema.index({ status: 1, scheduledAt: 1 });
notificationSchema.index({ createdAt: -1 });

notificationSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    title: this.title,
    body: this.body,
    imageUrl: this.imageUrl ?? null,
    type: this.type,
    actionType: this.actionType,
    actionPayload: this.actionPayload ?? {},
    audience: {
      type: this.audience?.type ?? 'all',
      userIds: (this.audience?.userIds ?? []).map((id) => id?.toString?.() ?? String(id)),
      filters: this.audience?.filters ?? null,
    },
    priority: this.priority,
    status: this.status,
    scheduledAt: this.scheduledAt?.toISOString?.() ?? null,
    sentAt: this.sentAt?.toISOString?.() ?? null,
    expiresAt: this.expiresAt?.toISOString?.() ?? null,
    createdBy: this.createdBy?.toString?.() ?? this.createdBy,
    stats: {
      totalTargets: this.stats?.totalTargets ?? 0,
      sent: this.stats?.sent ?? 0,
      failed: this.stats?.failed ?? 0,
      delivered: this.stats?.delivered ?? 0,
    },
    metadata: this.metadata ?? {},
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('Notification', notificationSchema);
