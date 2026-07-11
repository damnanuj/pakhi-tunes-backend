import { success } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { normalizeDeviceId } from '../services/guestService.js';
import {
  getLiveListeners,
  getListeningAnalyticsForDate,
  getSongListeners,
  getSongPopularity,
  getUserListeningSummary,
  getUserSongStats,
  listGuestsWithListeningStats,
  listUsersWithListeningStats,
  GUEST_LISTENING_LIMIT_MS,
  normalizeListeningPayload,
  reportListening,
  resolveListeningAnalyticsDayKey,
} from '../services/listeningService.js';
import { isValidIstDayKey } from '../utils/istDayKey.js';

function shouldTrackStats(req) {
  return req.body?.trackStats === true;
}

export const report = asyncHandler(async (req, res) => {
  if (!shouldTrackStats(req)) {
    success(res, {
      skipped: true,
      recorded: false,
      guestRemainingMs: null,
      guestTotalListenedMs: null,
    });
    return;
  }

  const deviceId = normalizeDeviceId(req.body.deviceId);
  if (!deviceId) {
    throw new AppError('deviceId is required', 400);
  }

  let payload;
  try {
    payload = normalizeListeningPayload(req.body);
  } catch (error) {
    throw new AppError(error.message || 'Invalid listening payload', 400);
  }

  if (payload.listenedMs <= 0) {
    success(res, {
      recorded: false,
      guestRemainingMs: req.user?.id ? null : GUEST_LISTENING_LIMIT_MS,
      guestTotalListenedMs: 0,
    });
    return;
  }

  const result = await reportListening({
    userId: req.user?.id ?? null,
    deviceId,
    ...payload,
  });

  success(res, result);
});

export const getLive = asyncHandler(async (_req, res) => {
  const data = await getLiveListeners();
  success(res, data);
});

export const listListeningUsers = asyncHandler(async (req, res) => {
  const data = await listUsersWithListeningStats({
    page: req.query.page,
    limit: req.query.limit,
    search: req.query.search,
  });
  success(res, data);
});

export const listListeningGuests = asyncHandler(async (req, res) => {
  const data = await listGuestsWithListeningStats({
    page: req.query.page,
    limit: req.query.limit,
    search: req.query.search,
  });
  success(res, data);
});

export const getUserSongs = asyncHandler(async (req, res) => {
  const data = await getUserSongStats(req.params.userId, {
    page: req.query.page,
    limit: req.query.limit,
    sortBy: req.query.sortBy,
  });
  success(res, data);
});

export const getUserSummary = asyncHandler(async (req, res) => {
  const summary = await getUserListeningSummary(req.params.userId);
  success(res, summary);
});

export const getPopularSongs = asyncHandler(async (req, res) => {
  const data = await getSongPopularity({
    page: req.query.page,
    limit: req.query.limit,
  });
  success(res, data);
});

export const getSongListenerList = asyncHandler(async (req, res) => {
  const data = await getSongListeners(req.params.songId, {
    page: req.query.page,
    limit: req.query.limit,
  });
  success(res, data);
});

export const getListeningAnalytics = asyncHandler(async (req, res) => {
  const dayKey = resolveListeningAnalyticsDayKey(req.query.date);
  if (!isValidIstDayKey(dayKey)) {
    throw new AppError('date must be YYYY-MM-DD (IST)', 400);
  }

  const data = await getListeningAnalyticsForDate(dayKey);
  success(res, data);
});
