import PlayHistory from '../models/PlayHistory.js';
import { success, successPaginated } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;
const MAX_LIMIT = 50;
const MAX_BULK_HISTORY = 100;

function parsePlayedAt(value) {
  if (value === undefined || value === null || value === '') {
    return new Date();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('Invalid playedAt date', 400);
  }
  return date;
}

function validateHistoryPayload(body) {
  const { songId, title, artist } = body;
  if (!songId || typeof songId !== 'string') {
    throw new AppError('songId is required', 400);
  }
  if (!title || typeof title !== 'string') {
    throw new AppError('title is required', 400);
  }
  if (!artist || typeof artist !== 'string') {
    throw new AppError('artist is required', 400);
  }

  return {
    songId: songId.trim(),
    title: title.trim(),
    artist: artist.trim(),
    encryptedId:
      typeof body.encryptedId === 'string'
        ? body.encryptedId.trim()
        : typeof body.encrypted_id === 'string'
          ? body.encrypted_id.trim()
          : '',
    artworkUrl: typeof body.artworkUrl === 'string' ? body.artworkUrl : '',
    albumId: typeof body.albumId === 'string' ? body.albumId.trim() : '',
    albumName: typeof body.albumName === 'string' ? body.albumName.trim() : '',
    durationSec:
      typeof body.durationSec === 'number' && body.durationSec >= 0
        ? body.durationSec
        : 0,
    language: typeof body.language === 'string' ? body.language.trim() : '',
    playedAt: parsePlayedAt(body.playedAt),
  };
}

async function upsertHistoryEntry(userId, payload) {
  const existing = await PlayHistory.findOne({ userId, songId: payload.songId });
  const playedAt =
    existing && existing.playedAt > payload.playedAt
      ? existing.playedAt
      : payload.playedAt;

  const entry = await PlayHistory.findOneAndUpdate(
    { userId, songId: payload.songId },
    {
      userId,
      songId: payload.songId,
      encryptedId: payload.encryptedId,
      title: payload.title,
      artist: payload.artist,
      artworkUrl: payload.artworkUrl,
      albumId: payload.albumId,
      albumName: payload.albumName,
      durationSec: payload.durationSec,
      language: payload.language,
      playedAt,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return entry;
}

export const getHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT)
  );
  const offset = Math.max(0, parseInt(req.query.offset, 10) || DEFAULT_OFFSET);
  const filter = { userId: req.user.id };

  const [entries, count] = await Promise.all([
    PlayHistory.find(filter)
      .sort({ playedAt: -1 })
      .skip(offset)
      .limit(limit),
    PlayHistory.countDocuments(filter),
  ]);

  successPaginated(
    res,
    entries.map((entry) => entry.toSafeObject()),
    count,
    limit,
    offset,
    200,
    req
  );
});

export const upsertHistory = asyncHandler(async (req, res) => {
  const payload = validateHistoryPayload(req.body);
  const entry = await upsertHistoryEntry(req.user.id, payload);

  success(res, { entry: entry.toSafeObject() }, 200);
});

export const bulkUpsertHistory = asyncHandler(async (req, res) => {
  const { songs } = req.body;

  if (!Array.isArray(songs) || songs.length === 0) {
    throw new AppError('songs array is required', 400);
  }

  if (songs.length > MAX_BULK_HISTORY) {
    throw new AppError(`Maximum ${MAX_BULK_HISTORY} songs per bulk request`, 400);
  }

  const userId = req.user.id;
  const payloads = songs.map((song) => validateHistoryPayload(song));
  let merged = 0;

  for (const payload of payloads) {
    const existing = await PlayHistory.findOne({ userId, songId: payload.songId });
    if (!existing || payload.playedAt >= existing.playedAt) {
      await upsertHistoryEntry(userId, payload);
      merged += 1;
    }
  }

  success(res, {
    merged,
    skipped: payloads.length - merged,
  });
});

export const removeHistoryEntry = asyncHandler(async (req, res) => {
  const { songId } = req.params;
  const entry = await PlayHistory.findOneAndDelete({
    userId: req.user.id,
    songId,
  });

  if (!entry) {
    throw new AppError('History entry not found', 404);
  }

  success(res, { songId, removed: true });
});

export const clearHistory = asyncHandler(async (req, res) => {
  const result = await PlayHistory.deleteMany({ userId: req.user.id });

  success(res, { removed: result.deletedCount ?? 0 });
});
