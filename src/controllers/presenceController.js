import { success } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getIstDayKey } from '../utils/istDayKey.js';
import {
  endPresence,
  getLiveCount,
  getTodayStats,
  heartbeatPresence,
  listUsageStats,
  normalizeDeviceId,
} from '../services/presenceService.js';

const DAY_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const heartbeat = asyncHandler(async (req, res) => {
  const deviceId = normalizeDeviceId(req.body.deviceId);
  if (!deviceId) {
    throw new AppError('deviceId is required', 400);
  }

  const userId = req.user?.id ?? null;
  const session = await heartbeatPresence({
    deviceId,
    platform: req.body.platform,
    appVersion: req.body.appVersion,
    userId,
  });

  success(res, {
    live: true,
    sessionId: session._id.toString(),
    session: session.toSafeObject(),
  });
});

export const end = asyncHandler(async (req, res) => {
  const deviceId = normalizeDeviceId(req.body.deviceId);
  if (!deviceId) {
    throw new AppError('deviceId is required', 400);
  }

  const session = await endPresence(deviceId);
  success(res, {
    ended: Boolean(session),
    session: session?.toSafeObject?.() ?? null,
  });
});

export const getLive = asyncHandler(async (_req, res) => {
  const sampledAt = new Date();
  const liveCount = await getLiveCount(sampledAt);
  success(res, {
    liveCount,
    sampledAt: sampledAt.toISOString(),
  });
});

export const getToday = asyncHandler(async (_req, res) => {
  const stats = await getTodayStats();
  success(res, stats);
});

export const getStatsRange = asyncHandler(async (req, res) => {
  let from = req.query.from?.trim();
  let to = req.query.to?.trim();

  if (from && !DAY_KEY_REGEX.test(from)) {
    throw new AppError('from must be YYYY-MM-DD', 400);
  }
  if (to && !DAY_KEY_REGEX.test(to)) {
    throw new AppError('to must be YYYY-MM-DD', 400);
  }

  if (!from && !to) {
    to = getIstDayKey();
    const end = new Date(`${to}T00:00:00+05:30`);
    end.setDate(end.getDate() - 6);
    from = getIstDayKey(end);
  }

  const days = await listUsageStats(from, to);
  success(res, { from, to, days });
});
