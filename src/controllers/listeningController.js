import { success, successPaginated } from '../utils/apiResponse.js';
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

const DEFAULT_LIMIT = 10;
const DEFAULT_OFFSET = 0;
const MAX_LIMIT = 100;

function parsePagination(query) {
  const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  const offset = Math.max(0, parseInt(query.offset, 10) || DEFAULT_OFFSET);
  return { limit, offset };
}

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
  const { limit, offset } = parsePagination(req.query);
  const data = await listUsersWithListeningStats({
    limit,
    offset,
    search: req.query.search,
    sort: req.query.sort,
    dir: req.query.dir,
    range: req.query.range,
  });
  successPaginated(res, data.results, data.count, limit, offset, 200, req);
});

export const listListeningGuests = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await listGuestsWithListeningStats({
    limit,
    offset,
    search: req.query.search,
    status: req.query.status,
    sort: req.query.sort,
    dir: req.query.dir,
    range: req.query.range,
  });
  successPaginated(res, data.results, data.count, limit, offset, 200, req);
});

export const getUserSongs = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await getUserSongStats(req.params.userId, {
    limit,
    offset,
    search: req.query.search,
    sort: req.query.sort,
    dir: req.query.dir,
    range: req.query.range,
  });
  successPaginated(res, data.results, data.count, limit, offset, 200, req);
});

export const getUserSummary = asyncHandler(async (req, res) => {
  const summary = await getUserListeningSummary(req.params.userId, {
    range: req.query.range,
  });
  if (!summary) {
    throw new AppError('User not found', 404);
  }
  success(res, summary);
});

export const getPopularSongs = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await getSongPopularity({ limit, offset, range: req.query.range });
  successPaginated(res, data.results, data.count, limit, offset, 200, req);
});

export const getSongListenerList = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await getSongListeners(req.params.songId, {
    limit,
    offset,
    range: req.query.range,
  });
  successPaginated(res, data.results, data.count, limit, offset, 200, req);
});

export const getListeningAnalytics = asyncHandler(async (req, res) => {
  const dayKey = resolveListeningAnalyticsDayKey(req.query.date);
  if (!isValidIstDayKey(dayKey)) {
    throw new AppError('date must be YYYY-MM-DD (IST)', 400);
  }

  const data = await getListeningAnalyticsForDate(dayKey);
  success(res, data);
});
