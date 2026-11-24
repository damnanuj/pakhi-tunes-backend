import Guest from '../models/Guest.js';
import User from '../models/User.js';
import UserSongStats from '../models/UserSongStats.js';
import { IST_TIME_ZONE, getIstDayBounds } from '../utils/istDayKey.js';
import { resolveReportRange } from '../utils/reportRange.js';

export async function getAdminDashboard(rangeInput) {
  const { range, from, to, start, end, bucket, keys } = resolveReportRange(rangeInput);
  const createdMatch = { createdAt: { $gte: start, $lt: end } };
  const playedMatch = { lastPlayedAt: { $gte: start, $lt: end } };
  const guestListeningMatch = {
    lastActiveAt: { $gte: start, $lt: end },
    totalListenedMs: { $gt: 0 },
  };

  const [
    newUsers,
    newGuests,
    conversions,
    playedTotals,
    userListenedMs,
    guestListenedMs,
    usersByBucket,
    guestsByBucket,
    conversionsByBucket,
    playedByBucket,
    userListenedByBucket,
    guestListenedByBucket,
    recentPlayRows,
    recentUserRows,
  ] = await Promise.all([
    User.countDocuments(createdMatch),
    Guest.countDocuments(createdMatch),
    Guest.countDocuments({ convertedAt: { $gte: start, $lt: end } }),
    countPlayed(playedMatch),
    sumListenedMs(UserSongStats, playedMatch),
    sumListenedMs(Guest, guestListeningMatch),
    countsByBucket(User, createdMatch, 'createdAt', bucket),
    countsByBucket(Guest, createdMatch, 'createdAt', bucket),
    countsByBucket(Guest, { convertedAt: { $gte: start, $lt: end } }, 'convertedAt', bucket),
    playedByBucketQuery(playedMatch, bucket),
    listenedByBucket(UserSongStats, playedMatch, 'lastPlayedAt', bucket),
    listenedByBucket(Guest, guestListeningMatch, 'lastActiveAt', bucket),
    UserSongStats.find({ lastPlayedAt: { $ne: null } })
      .sort({ lastPlayedAt: -1 })
      .limit(5)
      .populate('userId', 'name')
      .lean(),
    User.find().sort({ createdAt: -1 }).limit(5).select('name email createdAt').lean(),
  ]);

  return {
    range,
    from,
    to,
    totals: {
      newUsers,
      newGuests,
      conversions,
      usersPlayed: playedTotals.usersPlayed,
      songsPlayed: playedTotals.songsPlayed,
      listenedMs: userListenedMs + guestListenedMs,
    },
    series: keys.map((key) => {
      const played = playedByBucket.get(key);
      return {
        key,
        label: bucket === 'month' ? monthLabel(key) : dayLabel(key),
        newUsers: usersByBucket.get(key) ?? 0,
        newGuests: guestsByBucket.get(key) ?? 0,
        conversions: conversionsByBucket.get(key) ?? 0,
        usersPlayed: played?.usersPlayed ?? 0,
        songsPlayed: played?.songsPlayed ?? 0,
        listenedMs: (userListenedByBucket.get(key) ?? 0) + (guestListenedByBucket.get(key) ?? 0),
      };
    }),
    recentPlays: recentPlayRows.map((row) => {
      const user = playedUser(row.userId);
      return {
        songId: row.songId,
        title: row.title,
        artist: row.artist,
        artworkUrl: row.artworkUrl ?? '',
        userId: user.id,
        userName: user.name,
        playedAt: row.lastPlayedAt ? new Date(row.lastPlayedAt).toISOString() : null,
      };
    }),
    recentUsers: recentUserRows.map((row) => ({
      id: row._id.toString(),
      name: row.name,
      email: row.email,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    })),
  };
}

function dayLabel(dayKey) {
  const { start } = getIstDayBounds(dayKey);
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: IST_TIME_ZONE,
  }).format(start);
}

function monthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function bucketExpression(dateField, bucket) {
  return {
    $dateToString: {
      format: bucket === 'month' ? '%Y-%m' : '%Y-%m-%d',
      date: `$${dateField}`,
      timezone: IST_TIME_ZONE,
    },
  };
}

async function countsByBucket(Model, match, dateField, bucket) {
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: bucketExpression(dateField, bucket), count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id, row.count]));
}

async function countPlayed(match) {
  const [row] = await UserSongStats.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        users: { $addToSet: '$userId' },
        songs: { $addToSet: '$songId' },
      },
    },
    {
      $project: {
        usersPlayed: { $size: '$users' },
        songsPlayed: { $size: '$songs' },
      },
    },
  ]);

  return {
    usersPlayed: row?.usersPlayed ?? 0,
    songsPlayed: row?.songsPlayed ?? 0,
  };
}

async function playedByBucketQuery(match, bucket) {
  const rows = await UserSongStats.aggregate([
    { $match: match },
    {
      $group: {
        _id: bucketExpression('lastPlayedAt', bucket),
        users: { $addToSet: '$userId' },
        songs: { $addToSet: '$songId' },
      },
    },
    {
      $project: {
        usersPlayed: { $size: '$users' },
        songsPlayed: { $size: '$songs' },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [
      row._id,
      { usersPlayed: row.usersPlayed, songsPlayed: row.songsPlayed },
    ])
  );
}

async function sumListenedMs(Model, match) {
  const [row] = await Model.aggregate([
    { $match: match },
    { $group: { _id: null, listenedMs: { $sum: '$totalListenedMs' } } },
  ]);
  return row?.listenedMs ?? 0;
}

async function listenedByBucket(Model, match, dateField, bucket) {
  const rows = await Model.aggregate([
    { $match: match },
    {
      $group: {
        _id: bucketExpression(dateField, bucket),
        listenedMs: { $sum: '$totalListenedMs' },
      },
    },
  ]);
  return new Map(rows.map((row) => [row._id, row.listenedMs]));
}

function playedUser(value) {
  if (!value) return { id: null, name: 'Unknown user' };
  if (typeof value === 'object') {
    const id = value._id?.toString?.() ?? null;
    return { id, name: value.name || 'Unknown user' };
  }
  return { id: String(value), name: 'Unknown user' };
}

