import Device from '../models/Device.js';
import { AppError } from '../utils/AppError.js';

const PLATFORMS = new Set(['android', 'ios', 'web']);

export function normalizeInstallationId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizePlatform(value) {
  const platform = String(value ?? 'android').trim().toLowerCase();
  return PLATFORMS.has(platform) ? platform : 'android';
}

/**
 * Register or update a device for push notifications.
 * Upserts by installationId. Links userId when authenticated.
 */
export async function registerDevice({
  installationId,
  fcmToken,
  userId = null,
  platform,
  deviceModel = '',
  appVersion = '',
  clearUser = false,
}) {
  const normalizedId = normalizeInstallationId(installationId);
  if (!normalizedId) {
    throw new AppError('installationId is required', 400);
  }

  const token = typeof fcmToken === 'string' ? fcmToken.trim() : '';
  if (!token) {
    throw new AppError('fcmToken is required', 400);
  }

  const now = new Date();
  const update = {
    fcmToken: token,
    platform: normalizePlatform(platform),
    deviceModel: String(deviceModel ?? '').trim(),
    appVersion: String(appVersion ?? '').trim(),
    status: 'active',
    lastActiveAt: now,
  };

  if (clearUser) {
    update.userId = null;
  } else if (userId) {
    update.userId = userId;
  }

  // If the same FCM token is registered under a different installation, deactivate the old one
  await Device.updateMany(
    {
      fcmToken: token,
      installationId: { $ne: normalizedId },
      status: 'active',
    },
    { $set: { status: 'inactive' } }
  );

  const device = await Device.findOneAndUpdate(
    { installationId: normalizedId },
    {
      $set: update,
      $setOnInsert: { installationId: normalizedId },
    },
    { upsert: true, new: true, runValidators: true }
  );

  return device;
}

/**
 * Unlink user from a device (logout) while keeping it eligible for broadcasts.
 */
export async function unlinkUserFromDevice(installationId) {
  const normalizedId = normalizeInstallationId(installationId);
  if (!normalizedId) {
    throw new AppError('installationId is required', 400);
  }

  const device = await Device.findOneAndUpdate(
    { installationId: normalizedId },
    { $set: { userId: null, lastActiveAt: new Date() } },
    { new: true }
  );

  return device;
}

/**
 * Soft-deactivate a device (unregister).
 */
export async function unregisterDevice(installationId) {
  const normalizedId = normalizeInstallationId(installationId);
  if (!normalizedId) {
    throw new AppError('installationId is required', 400);
  }

  const device = await Device.findOneAndUpdate(
    { installationId: normalizedId },
    { $set: { status: 'inactive', lastActiveAt: new Date() } },
    { new: true }
  );

  return device;
}

/**
 * Mark devices with invalid FCM tokens as inactive.
 */
export async function deactivateInvalidTokens(tokens = []) {
  const unique = [...new Set(tokens.filter((t) => typeof t === 'string' && t.trim()))];
  if (unique.length === 0) {
    return { modifiedCount: 0 };
  }

  const result = await Device.updateMany(
    { fcmToken: { $in: unique }, status: 'active' },
    { $set: { status: 'inactive' } }
  );

  return { modifiedCount: result.modifiedCount ?? 0 };
}

/**
 * Resolve active FCM tokens for an audience query.
 * Returns unique tokens to avoid duplicate deliveries.
 */
export async function getActiveTokens(query = {}) {
  const devices = await Device.find(
    { status: 'active', ...query },
    { fcmToken: 1 }
  ).lean();

  const tokens = [];
  const seen = new Set();

  for (const device of devices) {
    const token = device.fcmToken?.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }

  return tokens;
}

/**
 * Admin list of devices with filters and pagination.
 */
export async function listDevices({
  status,
  platform,
  userId,
  search,
  limit = 20,
  offset = 0,
} = {}) {
  const filter = {};

  if (status && ['active', 'inactive'].includes(status)) {
    filter.status = status;
  }

  if (platform && PLATFORMS.has(platform)) {
    filter.platform = platform;
  }

  if (userId === 'null' || userId === 'guest') {
    filter.userId = null;
  } else if (userId) {
    filter.userId = userId;
  }

  if (search && typeof search === 'string' && search.trim()) {
    const q = search.trim();
    filter.$or = [
      { installationId: { $regex: q, $options: 'i' } },
      { deviceModel: { $regex: q, $options: 'i' } },
      { fcmToken: { $regex: q, $options: 'i' } },
    ];
  }

  const [results, count] = await Promise.all([
    Device.find(filter)
      .sort({ lastActiveAt: -1 })
      .skip(offset)
      .limit(limit)
      .populate('userId', 'name email')
      .lean(),
    Device.countDocuments(filter),
  ]);

  return {
    results: results.map((d) => ({
      id: d._id.toString(),
      installationId: d.installationId,
      fcmToken: d.fcmToken,
      userId: d.userId?._id?.toString?.() ?? d.userId?.toString?.() ?? null,
      user: d.userId?._id
        ? {
            id: d.userId._id.toString(),
            name: d.userId.name,
            email: d.userId.email,
          }
        : null,
      platform: d.platform,
      deviceModel: d.deviceModel ?? '',
      appVersion: d.appVersion ?? '',
      status: d.status,
      lastActiveAt: d.lastActiveAt,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
    count,
  };
}
