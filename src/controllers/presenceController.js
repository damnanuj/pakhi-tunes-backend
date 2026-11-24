import { success } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  endPresence,
  heartbeatPresence,
  normalizeDeviceId,
} from '../services/presenceService.js';

function shouldTrackStats(req) {
  return req.body?.trackStats === true;
}

export const heartbeat = asyncHandler(async (req, res) => {
  const deviceId = normalizeDeviceId(req.body.deviceId);
  if (!deviceId) {
    throw new AppError('deviceId is required', 400);
  }

  if (!shouldTrackStats(req)) {
    success(res, {
      skipped: true,
      live: false,
      sessionId: null,
      session: null,
    });
    return;
  }

  const userId = req.user?.id ?? null;
  const session = await heartbeatPresence({
    deviceId,
    platform: req.body.platform,
    appVersion: req.body.appVersion,
    userId,
    currentTrack: req.body.currentTrack ?? null,
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

  if (!shouldTrackStats(req)) {
    success(res, {
      skipped: true,
      ended: false,
      session: null,
    });
    return;
  }

  const session = await endPresence(deviceId);
  success(res, {
    ended: Boolean(session),
    session: session?.toSafeObject?.() ?? null,
  });
});
