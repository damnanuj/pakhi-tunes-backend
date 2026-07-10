import PresenceSession from '../models/PresenceSession.js';
import AppUsageDay from '../models/AppUsageDay.js';
import { getIstDayKey } from '../utils/istDayKey.js';

export const LIVE_WINDOW_MS = 2 * 60 * 1000;
export const STALE_WINDOW_MS = 3 * 60 * 1000;

const VALID_PLATFORMS = new Set(['ios', 'android', 'web']);

function normalizeCurrentTrack(currentTrack) {
  if (!currentTrack || typeof currentTrack !== 'object') {
    return {
      currentSongId: null,
      currentSongTitle: '',
      currentSongArtist: '',
      currentSongArtwork: '',
      currentSongEncryptedId: '',
      isPlayingSong: false,
    };
  }

  const songId =
    typeof currentTrack.songId === 'string' ? currentTrack.songId.trim() : '';
  const isPlayingSong = Boolean(currentTrack.isPlaying && songId);

  return {
    currentSongId: isPlayingSong ? songId : null,
    currentSongTitle:
      typeof currentTrack.title === 'string' ? currentTrack.title.trim() : '',
    currentSongArtist:
      typeof currentTrack.artist === 'string' ? currentTrack.artist.trim() : '',
    currentSongArtwork:
      typeof currentTrack.artworkUrl === 'string' ? currentTrack.artworkUrl : '',
    currentSongEncryptedId:
      typeof currentTrack.encryptedId === 'string'
        ? currentTrack.encryptedId.trim()
        : '',
    isPlayingSong,
  };
}

export function normalizePlatform(platform) {
  const value = String(platform ?? 'android').trim().toLowerCase();
  return VALID_PLATFORMS.has(value) ? value : 'android';
}

export function normalizeDeviceId(deviceId) {
  if (!deviceId || typeof deviceId !== 'string') {
    return null;
  }
  const trimmed = deviceId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function ensureUsageDay(dayKey) {
  let day = await AppUsageDay.findOne({ dayKey });
  if (day) return day;

  try {
    day = await AppUsageDay.create({ dayKey });
    return day;
  } catch (error) {
    if (error?.code === 11000) {
      return AppUsageDay.findOne({ dayKey });
    }
    throw error;
  }
}

export async function getLiveCount(now = new Date()) {
  const cutoff = new Date(now.getTime() - LIVE_WINDOW_MS);
  return PresenceSession.countDocuments({
    endedAt: null,
    lastSeenAt: { $gte: cutoff },
  });
}

async function trackDeviceOnDay(dayKey, deviceId) {
  const day = await ensureUsageDay(dayKey);
  if (!day.deviceIds.includes(deviceId)) {
    day.deviceIds.push(deviceId);
    day.uniqueDevices = day.deviceIds.length;
    await day.save();
  }
  return day;
}

export async function heartbeatPresence({
  deviceId,
  platform,
  appVersion,
  userId = null,
  currentTrack = null,
}) {
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  if (!normalizedDeviceId) {
    return null;
  }

  const now = new Date();
  const normalizedPlatform = normalizePlatform(platform);
  const version = String(appVersion ?? '').trim();
  const trackFields = normalizeCurrentTrack(currentTrack);

  let session = await PresenceSession.findOne({
    deviceId: normalizedDeviceId,
    endedAt: null,
  });

  if (!session) {
    const dayKey = getIstDayKey(now);
    session = await PresenceSession.create({
      deviceId: normalizedDeviceId,
      userId: userId || null,
      platform: normalizedPlatform,
      appVersion: version,
      startedAt: now,
      lastSeenAt: now,
      endedAt: null,
      durationMs: 0,
      dayKey,
      ...trackFields,
    });

    const day = await ensureUsageDay(dayKey);
    day.totalSessions = (day.totalSessions ?? 0) + 1;
    if (!day.deviceIds.includes(normalizedDeviceId)) {
      day.deviceIds.push(normalizedDeviceId);
      day.uniqueDevices = day.deviceIds.length;
    }
    await day.save();
  } else {
    session.lastSeenAt = now;
    session.platform = normalizedPlatform;
    session.appVersion = version;
    if (userId) {
      session.userId = userId;
    }
    Object.assign(session, trackFields);
    await session.save();
    await trackDeviceOnDay(session.dayKey, normalizedDeviceId);
  }

  return session;
}

export async function closePresenceSession(session, endedAt = new Date()) {
  if (!session || session.endedAt) {
    return session;
  }

  const end = endedAt;
  const start = session.startedAt ? new Date(session.startedAt) : end;
  const durationMs = Math.max(0, end.getTime() - start.getTime());

  session.endedAt = end;
  session.durationMs = durationMs;
  await session.save();

  const day = await ensureUsageDay(session.dayKey);
  day.totalDurationMs = (day.totalDurationMs ?? 0) + durationMs;
  await day.save();

  return session;
}

export async function endPresence(deviceId) {
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  if (!normalizedDeviceId) {
    return null;
  }

  const session = await PresenceSession.findOne({
    deviceId: normalizedDeviceId,
    endedAt: null,
  });

  if (!session) {
    return null;
  }

  return closePresenceSession(session);
}

export async function closeStalePresenceSessions(now = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_WINDOW_MS);
  const staleSessions = await PresenceSession.find({
    endedAt: null,
    lastSeenAt: { $lt: cutoff },
  });

  let closed = 0;
  for (const session of staleSessions) {
    await closePresenceSession(session, now);
    closed += 1;
  }

  return { closed, cutoff: cutoff.toISOString() };
}

export async function sampleLivePeakForToday(now = new Date()) {
  const dayKey = getIstDayKey(now);
  const liveCount = await getLiveCount(now);
  const day = await ensureUsageDay(dayKey);

  if (liveCount > (day.peakLiveCount ?? 0)) {
    day.peakLiveCount = liveCount;
    day.peakAt = now;
    await day.save();
  }

  return {
    dayKey,
    liveCount,
    peakLiveCount: day.peakLiveCount,
    peakAt: day.peakAt,
  };
}

export async function getTodayStats(now = new Date()) {
  const dayKey = getIstDayKey(now);
  const [liveCount, day] = await Promise.all([
    getLiveCount(now),
    ensureUsageDay(dayKey),
  ]);

  return {
    liveCount,
    sampledAt: now.toISOString(),
    day: day.toSafeObject(),
  };
}

export async function listUsageStats(fromDayKey, toDayKey) {
  const filter = {};
  if (fromDayKey || toDayKey) {
    filter.dayKey = {};
    if (fromDayKey) filter.dayKey.$gte = fromDayKey;
    if (toDayKey) filter.dayKey.$lte = toDayKey;
  }

  const days = await AppUsageDay.find(filter).sort({ dayKey: -1 }).limit(30);
  return days.map((day) => day.toSafeObject());
}
