import mongoose from 'mongoose';
import AppUsageDay from '../models/AppUsageDay.js';
import Guest from '../models/Guest.js';
import PresenceSession from '../models/PresenceSession.js';
import User from '../models/User.js';
import UserSongStats from '../models/UserSongStats.js';
import { getIstDayBounds, getIstDayKey } from '../utils/istDayKey.js';
import { LIVE_WINDOW_MS } from './presenceService.js';
import { normalizeDeviceId } from './guestService.js';

export const GUEST_LISTENING_LIMIT_MS = 120 * 60 * 1000;

const MIN_LISTENED_MS = 1000;

function clampListenedMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < MIN_LISTENED_MS) {
    return 0;
  }
  return Math.floor(parsed);
}

function listWindow(options = {}) {
  const limit = Math.max(1, Number(options.limit) || 10);
  const offset = Math.max(0, Number(options.offset) || 0);
  return { limit, offset };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveSort(sort, dir, fields, fallbackField) {
  const known = Object.prototype.hasOwnProperty.call(fields, sort);
  if (sort && !known) {
    return { [fallbackField]: -1 };
  }
  const field = known ? fields[sort] : fallbackField;
  return { [field]: dir === 'asc' ? 1 : -1 };
}

const USER_LIST_SORTS = {
  listened: 'totalListenedMs',
  plays: 'totalPlays',
  songs: 'totalSongs',
  lastPlayed: 'lastPlayedAt',
  name: 'user.name',
};

const GUEST_LIST_SORTS = {
  listened: 'totalListenedMs',
  lastActive: 'lastActiveAt',
  status: 'status',
};

const SONG_STAT_SORTS = {
  listened: 'totalListenedMs',
  plays: 'playCount',
  lastPlayed: 'lastPlayedAt',
  title: 'title',
};

const GUEST_LIST_STATUSES = new Set(['active', 'inactive', 'converted', 'banned']);

export function normalizeListeningPayload(body = {}) {
  const songId = typeof body.songId === 'string' ? body.songId.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const artist = typeof body.artist === 'string' ? body.artist.trim() : '';

  if (!songId) {
    throw new Error('songId is required');
  }
  if (!title) {
    throw new Error('title is required');
  }
  if (!artist) {
    throw new Error('artist is required');
  }

  return {
    songId,
    title,
    artist,
    encryptedId:
      typeof body.encryptedId === 'string'
        ? body.encryptedId.trim()
        : typeof body.encrypted_id === 'string'
          ? body.encrypted_id.trim()
          : '',
    artworkUrl: typeof body.artworkUrl === 'string' ? body.artworkUrl : '',
    albumName: typeof body.albumName === 'string' ? body.albumName.trim() : '',
    durationSec:
      typeof body.durationSec === 'number' && body.durationSec >= 0
        ? body.durationSec
        : 0,
    listenedMs: clampListenedMs(body.listenedMs),
  };
}

async function upsertUserSongStats(userId, payload) {
  const now = new Date();
  const entry = await UserSongStats.findOneAndUpdate(
    { userId, songId: payload.songId },
    {
      $set: {
        encryptedId: payload.encryptedId,
        title: payload.title,
        artist: payload.artist,
        artworkUrl: payload.artworkUrl,
        albumName: payload.albumName,
        durationSec: payload.durationSec,
        lastPlayedAt: now,
      },
      $inc: {
        totalListenedMs: payload.listenedMs,
        playCount: 1,
      },
      $setOnInsert: {
        userId,
        songId: payload.songId,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return entry;
}

async function incrementGuestListening(deviceId, listenedMs) {
  const guest = await Guest.findOneAndUpdate(
    { deviceId },
    {
      $inc: { totalListenedMs: listenedMs },
      $set: { lastActiveAt: new Date() },
    },
    { new: true }
  );

  if (!guest) {
    return null;
  }

  return guest;
}

export async function reportListening({
  userId = null,
  deviceId,
  songId,
  encryptedId,
  title,
  artist,
  artworkUrl,
  albumName,
  durationSec,
  listenedMs,
}) {
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  const payload = {
    songId,
    encryptedId,
    title,
    artist,
    artworkUrl,
    albumName,
    durationSec,
    listenedMs: clampListenedMs(listenedMs),
  };

  if (payload.listenedMs <= 0) {
    return {
      recorded: false,
      guestRemainingMs: userId ? null : GUEST_LISTENING_LIMIT_MS,
      guestTotalListenedMs: 0,
    };
  }

  if (userId) {
    await upsertUserSongStats(userId, payload);
    return {
      recorded: true,
      guestRemainingMs: null,
      guestTotalListenedMs: null,
    };
  }

  if (!normalizedDeviceId) {
    return {
      recorded: false,
      guestRemainingMs: GUEST_LISTENING_LIMIT_MS,
      guestTotalListenedMs: 0,
    };
  }

  const guest = await incrementGuestListening(normalizedDeviceId, payload.listenedMs);
  const guestTotalListenedMs = guest?.totalListenedMs ?? payload.listenedMs;
  const guestRemainingMs = Math.max(
    0,
    GUEST_LISTENING_LIMIT_MS - guestTotalListenedMs
  );

  return {
    recorded: true,
    guestRemainingMs,
    guestTotalListenedMs,
  };
}

export async function getUserSongStats(userId, options = {}) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return {
      results: [],
      count: 0,
    };
  }

  const { limit, offset } = listWindow(options);
  const sort = {
    ...resolveSort(options.sort, options.dir, SONG_STAT_SORTS, 'totalListenedMs'),
    _id: 1,
  };

  const filter = { userId: new mongoose.Types.ObjectId(userId) };
  const search = options.search?.trim();
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ title: pattern }, { artist: pattern }];
  }

  const [results, count] = await Promise.all([
    UserSongStats.find(filter)
      .sort(sort)
      .skip(offset)
      .limit(limit),
    UserSongStats.countDocuments(filter),
  ]);

  return {
    results: results.map((entry) => entry.toSafeObject()),
    count,
  };
}

export async function getUserListeningSummary(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }

  const user = await User.findById(userId).select('name email avatar role').lean();
  if (!user) {
    return null;
  }

  const [aggregate] = await UserSongStats.aggregate([
    { $match: { userId: user._id } },
    {
      $group: {
        _id: null,
        totalListenedMs: { $sum: '$totalListenedMs' },
        totalSongs: { $sum: 1 },
        totalPlays: { $sum: '$playCount' },
      },
    },
  ]);

  return {
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      avatar: user.avatar ?? null,
      role: user.role ?? 'user',
    },
    totalListenedMs: aggregate?.totalListenedMs ?? 0,
    totalSongs: aggregate?.totalSongs ?? 0,
    totalPlays: aggregate?.totalPlays ?? 0,
  };
}

export async function listUsersWithListeningStats(options = {}) {
  const { limit, offset } = listWindow(options);
  const search = options.search?.trim();
  const pattern = search ? escapeRegex(search) : '';

  const matchUsers = pattern
    ? {
        $or: [
          { 'user.name': { $regex: pattern, $options: 'i' } },
          { 'user.email': { $regex: pattern, $options: 'i' } },
        ],
      }
    : null;

  const basePipeline = [
    {
      $group: {
        _id: '$userId',
        totalListenedMs: { $sum: '$totalListenedMs' },
        totalSongs: { $sum: 1 },
        totalPlays: { $sum: '$playCount' },
        lastPlayedAt: { $max: '$lastPlayedAt' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    ...(matchUsers ? [{ $match: matchUsers }] : []),
    {
      $sort: {
        ...resolveSort(options.sort, options.dir, USER_LIST_SORTS, 'totalListenedMs'),
        _id: 1,
      },
    },
  ];

  const [aggregated, countResult] = await Promise.all([
    UserSongStats.aggregate([...basePipeline, { $skip: offset }, { $limit: limit }]),
    UserSongStats.aggregate([...basePipeline, { $count: 'count' }]),
  ]);

  return {
    results: aggregated.map((row) => ({
      userId: row._id.toString(),
      name: row.user?.name ?? 'Unknown user',
      email: row.user?.email ?? '',
      avatar: row.user?.avatar ?? null,
      role: row.user?.role ?? 'user',
      totalListenedMs: row.totalListenedMs ?? 0,
      totalSongs: row.totalSongs ?? 0,
      totalPlays: row.totalPlays ?? 0,
      lastPlayedAt: row.lastPlayedAt?.toISOString?.() ?? row.lastPlayedAt ?? null,
    })),
    count: countResult[0]?.count ?? 0,
  };
}

export async function listGuestsWithListeningStats(options = {}) {
  const { limit, offset } = listWindow(options);
  const search = options.search?.trim();
  const filter = { totalListenedMs: { $gt: 0 } };

  if (search) {
    filter.deviceId = { $regex: escapeRegex(search), $options: 'i' };
  }

  if (GUEST_LIST_STATUSES.has(options.status)) {
    filter.status = options.status;
  }

  const sort = {
    ...resolveSort(options.sort, options.dir, GUEST_LIST_SORTS, 'totalListenedMs'),
    _id: 1,
  };

  const [guests, count] = await Promise.all([
    Guest.find(filter).sort(sort).skip(offset).limit(limit).lean(),
    Guest.countDocuments(filter),
  ]);

  const convertedIds = guests
    .map((guest) => guest.convertedUserId)
    .filter(Boolean);
  const convertedUsers = convertedIds.length
    ? await User.find({ _id: { $in: convertedIds } }).select('name email').lean()
    : [];
  const userMap = new Map(
    convertedUsers.map((user) => [user._id.toString(), user])
  );

  return {
    results: guests.map((guest) => {
      const convertedUserId = guest.convertedUserId?.toString?.() ?? null;
      const converted = convertedUserId ? userMap.get(convertedUserId) : null;

      return {
        guestId: guest._id.toString(),
        deviceId: guest.deviceId,
        platform: guest.platform,
        totalListenedMs: guest.totalListenedMs ?? 0,
        lastActiveAt: guest.lastActiveAt?.toISOString?.() ?? guest.lastActiveAt,
        status: guest.status,
        convertedUserId,
        convertedAt: guest.convertedAt?.toISOString?.() ?? guest.convertedAt ?? null,
        convertedUser: converted
          ? {
              id: converted._id.toString(),
              name: converted.name ?? 'Unknown user',
              email: converted.email ?? '',
            }
          : null,
      };
    }),
    count,
  };
}

export async function getSongPopularity(options = {}) {
  const { limit, offset } = listWindow(options);

  const [results, countResult] = await Promise.all([
    UserSongStats.aggregate([
      {
        $group: {
          _id: '$songId',
          encryptedId: { $first: '$encryptedId' },
          title: { $first: '$title' },
          artist: { $first: '$artist' },
          artworkUrl: { $first: '$artworkUrl' },
          totalListenedMs: { $sum: '$totalListenedMs' },
          totalPlayCount: { $sum: '$playCount' },
          uniqueListenerCount: { $addToSet: '$userId' },
        },
      },
      {
        $project: {
          songId: '$_id',
          encryptedId: 1,
          title: 1,
          artist: 1,
          artworkUrl: 1,
          totalListenedMs: 1,
          totalPlayCount: 1,
          uniqueListenerCount: { $size: '$uniqueListenerCount' },
        },
      },
      { $sort: { uniqueListenerCount: -1, totalListenedMs: -1 } },
      { $skip: offset },
      { $limit: limit },
    ]),
    UserSongStats.aggregate([
      { $group: { _id: '$songId' } },
      { $count: 'count' },
    ]),
  ]);

  return {
    results,
    count: countResult[0]?.count ?? 0,
  };
}

export async function getSongListeners(songId, options = {}) {
  const { limit, offset } = listWindow(options);
  const filter = { songId: String(songId).trim() };

  const [entries, count] = await Promise.all([
    UserSongStats.find(filter)
      .sort({ totalListenedMs: -1 })
      .skip(offset)
      .limit(limit)
      .populate('userId', 'name email avatar'),
    UserSongStats.countDocuments(filter),
  ]);

  const results = entries.map((entry) => {
    const safe = entry.toSafeObject();
    const user = entry.userId;
    return {
      ...safe,
      user:
        user && typeof user === 'object'
          ? {
              id: user._id?.toString?.() ?? null,
              name: user.name ?? '',
              email: user.email ?? '',
              avatar: user.avatar ?? null,
            }
          : null,
    };
  });

  return {
    results,
    count,
  };
}

export async function getLiveListeners(now = new Date()) {
  const cutoff = new Date(now.getTime() - LIVE_WINDOW_MS);

  const sessions = await PresenceSession.find({
    endedAt: null,
    lastSeenAt: { $gte: cutoff },
    isPlayingSong: true,
    currentSongId: { $ne: null },
  })
    .sort({ lastSeenAt: -1 })
    .lean();

  const userIds = [
    ...new Set(
      sessions
        .map((session) => session.userId?.toString?.())
        .filter((value) => Boolean(value))
    ),
  ];

  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select('name email').lean()
    : [];
  const userMap = new Map(users.map((user) => [user._id.toString(), user]));

  const grouped = new Map();

  for (const session of sessions) {
    const songId = session.currentSongId;
    if (!songId) continue;

    if (!grouped.has(songId)) {
      grouped.set(songId, {
        songId,
        songTitle: session.currentSongTitle ?? '',
        songArtist: session.currentSongArtist ?? '',
        songArtwork: session.currentSongArtwork ?? '',
        songEncryptedId: session.currentSongEncryptedId ?? '',
        listenerCount: 0,
        listeners: [],
      });
    }

    const group = grouped.get(songId);
    group.listenerCount += 1;

    const userId = session.userId?.toString?.() ?? null;
    const user = userId ? userMap.get(userId) : null;

    group.listeners.push({
      userId,
      userName: user?.name ?? 'Guest',
      userEmail: user?.email ?? '',
      deviceId: session.deviceId,
      lastSeenAt: session.lastSeenAt?.toISOString?.() ?? session.lastSeenAt,
    });
  }

  return {
    sampledAt: now.toISOString(),
    songs: [...grouped.values()].sort((a, b) => b.listenerCount - a.listenerCount),
  };
}

const LISTENING_ANALYTICS_NOTES = [
  'Daily listening minutes and total replay counts are not stored per day.',
  'Unique listeners and songs are based on registered-user listening reports (lastPlayedAt).',
  'Peak concurrent users comes from presence tracking, not playback reports.',
];

export async function getListeningAnalyticsForDate(dayKey, now = new Date()) {
  const { start, end } = getIstDayBounds(dayKey);
  const lastPlayedFilter = { lastPlayedAt: { $gte: start, $lt: end } };
  const guestActiveFilter = { lastActiveAt: { $gte: start, $lt: end } };

  const [usageDay, listeningAggregate, activeGuests] = await Promise.all([
    AppUsageDay.findOne({ dayKey }).lean(),
    UserSongStats.aggregate([
      { $match: lastPlayedFilter },
      {
        $group: {
          _id: null,
          uniqueListeners: { $addToSet: '$userId' },
          uniqueSongs: { $addToSet: '$songId' },
          listeningEntries: { $sum: 1 },
        },
      },
      {
        $project: {
          uniqueListeners: { $size: '$uniqueListeners' },
          uniqueSongsPlayed: { $size: '$uniqueSongs' },
          listeningEntries: 1,
        },
      },
    ]),
    Guest.countDocuments(guestActiveFilter),
  ]);

  const listening = listeningAggregate[0] ?? {
    uniqueListeners: 0,
    uniqueSongsPlayed: 0,
    listeningEntries: 0,
  };

  return {
    date: dayKey,
    sampledAt: now.toISOString(),
    presence: {
      peakLiveCount: usageDay?.peakLiveCount ?? 0,
      totalSessions: usageDay?.totalSessions ?? 0,
      uniqueDevices: usageDay?.uniqueDevices ?? 0,
      totalForegroundMs: usageDay?.totalDurationMs ?? 0,
    },
    listening: {
      uniqueListeners: listening.uniqueListeners ?? 0,
      uniqueSongsPlayed: listening.uniqueSongsPlayed ?? 0,
      listeningEntries: listening.listeningEntries ?? 0,
    },
    guests: {
      activeGuests,
    },
    dataNotes: LISTENING_ANALYTICS_NOTES,
  };
}

export function resolveListeningAnalyticsDayKey(dateParam) {
  if (!dateParam) {
    return getIstDayKey();
  }
  return String(dateParam).trim();
}
