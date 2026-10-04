import mongoose from 'mongoose';
import Notification, {
  ACTION_TYPES,
  AUDIENCE_TYPES,
  NOTIFICATION_STATUSES,
  NOTIFICATION_TYPES,
} from '../models/Notification.js';
import NotificationLog from '../models/NotificationLog.js';
import User from '../models/User.js';
import { retrySendToTokens, sendToDevices } from '../integrations/fcm.js';
import {
  deactivateInvalidTokens,
  getActiveTokens,
} from './deviceService.js';
import { AppError } from '../utils/AppError.js';

const RETRY_DELAY_MS = 2_000;
const SENDABLE_STATUSES = new Set(['draft', 'scheduled']);
const RESENDABLE_STATUSES = new Set(['sent', 'failed', 'cancelled']);

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateActionPayload(actionType, actionPayload = {}) {
  const payload = actionPayload && typeof actionPayload === 'object' ? actionPayload : {};

  switch (actionType) {
    case 'play_song':
      if (!payload.songId) throw new AppError('actionPayload.songId is required for play_song', 400);
      break;
    case 'open_album':
      if (!payload.albumId) throw new AppError('actionPayload.albumId is required for open_album', 400);
      break;
    case 'open_playlist':
      if (!payload.playlistId) {
        throw new AppError('actionPayload.playlistId is required for open_playlist', 400);
      }
      break;
    case 'open_artist':
      if (!payload.artistId) {
        throw new AppError('actionPayload.artistId is required for open_artist', 400);
      }
      break;
    case 'navigate':
      if (!payload.screen) throw new AppError('actionPayload.screen is required for navigate', 400);
      break;
    case 'open_url':
      if (!payload.url) throw new AppError('actionPayload.url is required for open_url', 400);
      break;
    case 'open_app':
    default:
      break;
  }

  return payload;
}

function normalizeAudience(audience = {}) {
  const type = audience.type ?? 'all';
  if (!AUDIENCE_TYPES.includes(type)) {
    throw new AppError(`Invalid audience type: ${type}`, 400);
  }

  const userIds = Array.isArray(audience.userIds)
    ? audience.userIds.filter((id) => mongoose.Types.ObjectId.isValid(id))
    : [];

  if ((type === 'single_user' || type === 'multiple_users') && userIds.length === 0) {
    throw new AppError('audience.userIds is required for user targeting', 400);
  }

  if (type === 'single_user' && userIds.length > 1) {
    throw new AppError('single_user audience accepts exactly one userId', 400);
  }

  return {
    type,
    userIds,
    filters: audience.filters ?? null,
  };
}

/**
 * Resolve FCM tokens for a given audience definition.
 */
export async function resolveAudience(audience) {
  const normalized = normalizeAudience(audience);
  const baseQuery = { status: 'active' };

  switch (normalized.type) {
    case 'all':
      return getActiveTokens(baseQuery);

    case 'logged_in':
      return getActiveTokens({ ...baseQuery, userId: { $ne: null } });

    case 'guests':
      return getActiveTokens({ ...baseQuery, userId: null });

    case 'single_user':
    case 'multiple_users':
      return getActiveTokens({
        ...baseQuery,
        userId: { $in: normalized.userIds },
      });

    case 'segment': {
      // Future-proof: apply optional filters without breaking current logic
      const filters = normalized.filters && typeof normalized.filters === 'object'
        ? normalized.filters
        : {};
      const query = { ...baseQuery };

      if (filters.platform) query.platform = filters.platform;
      if (filters.appVersion) query.appVersion = filters.appVersion;
      if (filters.userId != null) {
        query.userId = filters.userId === 'null' ? null : filters.userId;
      }
      if (filters.lastActiveAfter) {
        query.lastActiveAt = { $gte: new Date(filters.lastActiveAfter) };
      }

      return getActiveTokens(query);
    }

    default:
      return getActiveTokens(baseQuery);
  }
}

/**
 * Create a notification. Optionally schedule or send immediately.
 *
 * @param {object} data
 * @param {string} adminUserId
 * @param {{ sendNow?: boolean }} options
 */
export async function createNotification(data, adminUserId, options = {}) {
  const title = String(data.title ?? '').trim();
  const body = String(data.body ?? '').trim();

  if (!title) throw new AppError('title is required', 400);
  if (!body) throw new AppError('body is required', 400);

  const type = data.type ?? 'general';
  if (!NOTIFICATION_TYPES.includes(type)) {
    throw new AppError(`Invalid notification type: ${type}`, 400);
  }

  const actionType = data.actionType ?? 'open_app';
  if (!ACTION_TYPES.includes(actionType)) {
    throw new AppError(`Invalid action type: ${actionType}`, 400);
  }

  const actionPayload = validateActionPayload(actionType, data.actionPayload);
  const audience = normalizeAudience(data.audience);

  let scheduledAt = null;
  if (data.scheduledAt) {
    scheduledAt = new Date(data.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new AppError('Invalid scheduledAt', 400);
    }
    if (scheduledAt.getTime() <= Date.now()) {
      throw new AppError('scheduledAt must be in the future', 400);
    }
  }

  let expiresAt = null;
  if (data.expiresAt) {
    expiresAt = new Date(data.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new AppError('Invalid expiresAt', 400);
    }
  }

  const sendNow = options.sendNow === true && !scheduledAt;
  const status = scheduledAt ? 'scheduled' : sendNow ? 'draft' : (data.status ?? 'draft');

  if (!['draft', 'scheduled'].includes(status) && !sendNow) {
    throw new AppError('New notifications must be draft or scheduled', 400);
  }

  const notification = await Notification.create({
    title,
    body,
    imageUrl: data.imageUrl ? String(data.imageUrl).trim() : null,
    type,
    actionType,
    actionPayload,
    audience,
    priority: data.priority === 'high' ? 'high' : 'normal',
    status: scheduledAt ? 'scheduled' : 'draft',
    scheduledAt,
    expiresAt,
    createdBy: adminUserId,
    metadata: data.metadata ?? {},
  });

  if (sendNow) {
    return sendNotification(notification._id.toString());
  }

  return notification;
}

async function writeBatchLogs(notificationId, batches, { isRetry = false } = {}) {
  if (!batches?.length) return [];

  const docs = batches.map((batch) => ({
    notificationId,
    batchIndex: batch.batchIndex,
    totalInBatch: batch.totalInBatch,
    successCount: batch.successCount,
    failureCount: batch.failureCount,
    failedTokens: batch.failedTokens ?? [],
    invalidTokens: batch.invalidTokens ?? [],
    error: batch.error ?? null,
    durationMs: batch.durationMs ?? null,
    isRetry,
  }));

  return NotificationLog.insertMany(docs);
}

/**
 * Send a notification by ID. Prevents duplicate sends.
 */
export async function sendNotification(notificationId) {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new AppError('Invalid notification id', 400);
  }

  const notification = await Notification.findById(notificationId);
  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  if (!SENDABLE_STATUSES.has(notification.status)) {
    throw new AppError(
      `Cannot send notification with status "${notification.status}"`,
      409
    );
  }

  if (notification.expiresAt && notification.expiresAt.getTime() < Date.now()) {
    notification.status = 'cancelled';
    await notification.save();
    throw new AppError('Notification has expired', 410);
  }

  notification.status = 'sending';
  await notification.save();

  try {
    const tokens = await resolveAudience(notification.audience);
    notification.stats.totalTargets = tokens.length;

    if (tokens.length === 0) {
      notification.status = 'failed';
      notification.sentAt = new Date();
      notification.stats.sent = 0;
      notification.stats.failed = 0;
      await notification.save();
      await NotificationLog.create({
        notificationId: notification._id,
        batchIndex: 0,
        totalInBatch: 0,
        successCount: 0,
        failureCount: 0,
        error: 'No active devices matched this audience.',
      });
      return notification;
    }

    const result = await sendToDevices(tokens, notification);

    // Retry once for non-invalid failed tokens after a short delay
    const retryCandidates = [
      ...new Set(
        result.batches
          .flatMap((b) => b.failedTokens ?? [])
          .filter((t) => !result.invalidTokens.includes(t))
      ),
    ];

    let retryResult = null;
    if (retryCandidates.length > 0) {
      await sleep(RETRY_DELAY_MS);
      retryResult = await retrySendToTokens(retryCandidates, notification);

      result.successCount += retryResult.successCount;
      result.invalidTokens = [
        ...new Set([...result.invalidTokens, ...(retryResult.invalidTokens ?? [])]),
      ];
    }

    result.failureCount = Math.max(0, tokens.length - result.successCount);

    await writeBatchLogs(notification._id, result.batches);

    if (retryResult) {
      await writeBatchLogs(
        notification._id,
        [
          {
            batchIndex: result.batches.length,
            totalInBatch: retryCandidates.length,
            successCount: retryResult.successCount,
            failureCount: retryResult.failureCount,
            failedTokens: retryResult.failedTokens ?? [],
            invalidTokens: retryResult.invalidTokens ?? [],
            error: retryResult.error,
            durationMs: retryResult.durationMs,
          },
        ],
        { isRetry: true }
      );
    }

    if (result.invalidTokens.length > 0) {
      await deactivateInvalidTokens(result.invalidTokens);
    }

    notification.stats.sent = result.successCount;
    notification.stats.failed = result.failureCount;
    notification.stats.delivered = result.successCount;
    notification.sentAt = new Date();
    notification.status =
      result.successCount === 0 && result.failureCount > 0 ? 'failed' : 'sent';

    await notification.save();
    return notification;
  } catch (error) {
    notification.status = 'failed';
    await notification.save();

    await NotificationLog.create({
      notificationId: notification._id,
      batchIndex: 0,
      totalInBatch: 0,
      successCount: 0,
      failureCount: 0,
      error: error?.message ?? 'Send failed',
    });

    throw error;
  }
}

/**
 * Cancel a scheduled notification.
 */
export async function cancelNotification(notificationId) {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new AppError('Invalid notification id', 400);
  }

  const notification = await Notification.findById(notificationId);
  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  if (notification.status !== 'scheduled' && notification.status !== 'draft') {
    throw new AppError(
      `Cannot cancel notification with status "${notification.status}"`,
      409
    );
  }

  notification.status = 'cancelled';
  await notification.save();
  return notification;
}

/**
 * Delete a draft/cancelled notification.
 */
export async function deleteNotification(notificationId) {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new AppError('Invalid notification id', 400);
  }

  const notification = await Notification.findById(notificationId);
  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  if (!['draft', 'cancelled'].includes(notification.status)) {
    throw new AppError('Only draft or cancelled notifications can be deleted', 409);
  }

  await NotificationLog.deleteMany({ notificationId: notification._id });
  await notification.deleteOne();
  return { deleted: true };
}

async function loadAudienceUsers(userIds = []) {
  const ids = userIds
    .map((id) => id?.toString?.() ?? String(id))
    .filter((id) => mongoose.Types.ObjectId.isValid(id));

  if (ids.length === 0) return [];

  const users = await User.find({ _id: { $in: ids } })
    .select('name email role')
    .lean();
  const byId = new Map(users.map((user) => [user._id.toString(), user]));

  return ids.map((id) => {
    const user = byId.get(id);
    if (!user) {
      return { id, name: 'Deleted user', email: '', role: 'user' };
    }
    return {
      id,
      name: user.name,
      email: user.email,
      role: user.role ?? 'user',
    };
  });
}

/**
 * Paginated notification list for admin history.
 * Search matches title, body, and targeted user name/email, and combines
 * with status, type, and audience filters (including "all").
 */
export async function listNotifications({
  status,
  type,
  audience,
  search,
  limit = 20,
  offset = 0,
} = {}) {
  const filter = {};
  if (status && NOTIFICATION_STATUSES.includes(status)) filter.status = status;
  if (type && NOTIFICATION_TYPES.includes(type)) filter.type = type;

  if (audience === 'specific') {
    filter['audience.type'] = { $in: ['single_user', 'multiple_users'] };
  } else if (audience && AUDIENCE_TYPES.includes(audience)) {
    filter['audience.type'] = audience;
  }

  const query = typeof search === 'string' ? search.trim().slice(0, 100) : '';
  if (query) {
    const regex = new RegExp(escapeRegex(query), 'i');
    const matchedUsers = await User.find({
      $or: [{ name: regex }, { email: regex }],
    })
      .select('_id')
      .limit(50)
      .lean();
    const matchedIds = matchedUsers.map((user) => user._id);
    filter.$or = [
      { title: regex },
      { body: regex },
      ...(matchedIds.length ? [{ 'audience.userIds': { $in: matchedIds } }] : []),
    ];
  }

  const [results, count] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .populate('createdBy', 'name email')
      .lean(),
    Notification.countDocuments(filter),
  ]);

  return {
    results: results.map((n) => ({
      id: n._id.toString(),
      title: n.title,
      body: n.body,
      imageUrl: n.imageUrl ?? null,
      type: n.type,
      actionType: n.actionType,
      actionPayload: n.actionPayload ?? {},
      audience: {
        type: n.audience?.type ?? 'all',
        userIds: (n.audience?.userIds ?? []).map((id) => id?.toString?.() ?? String(id)),
        filters: n.audience?.filters ?? null,
      },
      priority: n.priority,
      status: n.status,
      scheduledAt: n.scheduledAt ?? null,
      sentAt: n.sentAt ?? null,
      expiresAt: n.expiresAt ?? null,
      createdBy: n.createdBy
        ? {
            id: n.createdBy._id?.toString?.() ?? n.createdBy.toString(),
            name: n.createdBy.name,
            email: n.createdBy.email,
          }
        : null,
      stats: n.stats ?? { totalTargets: 0, sent: 0, failed: 0, delivered: 0 },
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    })),
    count,
  };
}

/**
 * Get a single notification with delivery logs.
 */
export async function getNotificationDetail(notificationId) {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new AppError('Invalid notification id', 400);
  }

  const notification = await Notification.findById(notificationId)
    .populate('createdBy', 'name email')
    .lean();

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  const logs = await NotificationLog.find({ notificationId: notification._id })
    .sort({ batchIndex: 1, createdAt: 1 })
    .lean();

  const audienceUserIds = (notification.audience?.userIds ?? []).map(
    (id) => id?.toString?.() ?? String(id)
  );
  const audienceUsers = await loadAudienceUsers(audienceUserIds);

  return {
    id: notification._id.toString(),
    title: notification.title,
    body: notification.body,
    imageUrl: notification.imageUrl ?? null,
    type: notification.type,
    actionType: notification.actionType,
    actionPayload: notification.actionPayload ?? {},
    audience: {
      type: notification.audience?.type ?? 'all',
      userIds: (notification.audience?.userIds ?? []).map(
        (id) => id?.toString?.() ?? String(id)
      ),
      filters: notification.audience?.filters ?? null,
    },
    priority: notification.priority,
    status: notification.status,
    scheduledAt: notification.scheduledAt ?? null,
    sentAt: notification.sentAt ?? null,
    expiresAt: notification.expiresAt ?? null,
    createdBy: notification.createdBy
      ? {
          id: notification.createdBy._id?.toString?.() ?? notification.createdBy.toString(),
          name: notification.createdBy.name,
          email: notification.createdBy.email,
        }
      : null,
    stats: notification.stats ?? { totalTargets: 0, sent: 0, failed: 0, delivered: 0 },
    metadata: notification.metadata ?? {},
    audienceUsers,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
    logs: logs.map((log) => ({
      id: log._id.toString(),
      batchIndex: log.batchIndex,
      totalInBatch: log.totalInBatch,
      successCount: log.successCount,
      failureCount: log.failureCount,
      failedTokenCount: (log.failedTokens ?? []).length,
      invalidTokenCount: (log.invalidTokens ?? []).length,
      error: log.error ?? null,
      durationMs: log.durationMs ?? null,
      isRetry: log.isRetry ?? false,
      createdAt: log.createdAt,
    })),
  };
}

/**
 * Aggregate delivery stats for admin dashboard.
 */
export async function getNotificationStats() {
  const [byStatus, totals] = await Promise.all([
    Notification.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Notification.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          sent: { $sum: '$stats.sent' },
          failed: { $sum: '$stats.failed' },
          targets: { $sum: '$stats.totalTargets' },
        },
      },
    ]),
  ]);

  const statusCounts = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
  const aggregate = totals[0] ?? { total: 0, sent: 0, failed: 0, targets: 0 };

  return {
    total: aggregate.total,
    byStatus: statusCounts,
    delivery: {
      totalTargets: aggregate.targets,
      sent: aggregate.sent,
      failed: aggregate.failed,
    },
  };
}

/**
 * Send the same notification again as a new delivery.
 * The original record stays in history.
 */
export async function resendNotification(notificationId, adminUserId) {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new AppError('Invalid notification id', 400);
  }
  if (!adminUserId) {
    throw new AppError('Admin user is required', 401);
  }

  const source = await Notification.findById(notificationId);
  if (!source) {
    throw new AppError('Notification not found', 404);
  }

  if (!RESENDABLE_STATUSES.has(source.status)) {
    throw new AppError(
      `Cannot send again while status is "${source.status}"`,
      409
    );
  }

  const plain = source.toObject();
  const clone = await Notification.create({
    title: plain.title,
    body: plain.body,
    imageUrl: plain.imageUrl ?? null,
    type: plain.type,
    actionType: plain.actionType,
    actionPayload: plain.actionPayload ?? {},
    audience: {
      type: plain.audience?.type ?? 'all',
      userIds: plain.audience?.userIds ?? [],
      filters: plain.audience?.filters ?? null,
    },
    priority: plain.priority === 'high' ? 'high' : 'normal',
    status: 'draft',
    createdBy: adminUserId,
    metadata: { retriedFrom: source._id.toString() },
  });

  return sendNotification(clone._id.toString());
}

/**
 * Cron job: send due scheduled notifications.
 */
export async function processScheduledNotifications() {
  const now = new Date();
  const due = await Notification.find({
    status: 'scheduled',
    scheduledAt: { $lte: now },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  })
    .sort({ scheduledAt: 1 })
    .limit(20);

  const results = [];

  for (const notification of due) {
    try {
      const sent = await sendNotification(notification._id.toString());
      results.push({
        id: sent._id.toString(),
        status: sent.status,
        ok: sent.status === 'sent',
      });
    } catch (error) {
      console.error(
        `[notifications] Failed to send scheduled ${notification._id}:`,
        error?.message
      );
      results.push({
        id: notification._id.toString(),
        status: 'failed',
        ok: false,
        error: error?.message,
      });
    }
  }

  return { processed: results.length, results };
}
