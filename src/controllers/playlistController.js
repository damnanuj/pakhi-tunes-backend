import mongoose from 'mongoose';
import Playlist from '../models/Playlist.js';
import { success, successPaginated } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;
const MAX_PLAYLIST_NAME_LENGTH = 80;

function validateSongPayload(body) {
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
    artworkUrl: typeof body.artworkUrl === 'string' ? body.artworkUrl : '',
    encryptedId:
      typeof body.encryptedId === 'string'
        ? body.encryptedId.trim()
        : typeof body.encrypted_id === 'string'
          ? body.encrypted_id.trim()
          : '',
  };
}

function assertValidObjectId(id, label = 'Playlist') {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(`${label} not found`, 404);
  }
}

async function findUserPlaylist(userId, playlistId) {
  assertValidObjectId(playlistId);
  const playlist = await Playlist.findOne({ _id: playlistId, userId });
  if (!playlist) {
    throw new AppError('Playlist not found', 404);
  }
  return playlist;
}

function validatePlaylistName(name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new AppError('name is required', 400);
  }
  const trimmed = name.trim();
  if (trimmed.length > MAX_PLAYLIST_NAME_LENGTH) {
    throw new AppError(
      `Playlist name must be ${MAX_PLAYLIST_NAME_LENGTH} characters or fewer`,
      400
    );
  }
  return trimmed;
}

export const getPlaylists = asyncHandler(async (req, res) => {
  const limit = Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || DEFAULT_OFFSET);

  const filter = { userId: req.user.id };

  const [playlists, count] = await Promise.all([
    Playlist.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit),
    Playlist.countDocuments(filter),
  ]);

  successPaginated(
    res,
    playlists.map((playlist) => playlist.toListObject()),
    count,
    limit,
    offset,
    200,
    req
  );
});

export const createPlaylist = asyncHandler(async (req, res) => {
  const name = validatePlaylistName(req.body.name);
  const coverUrl =
    typeof req.body.coverUrl === 'string' ? req.body.coverUrl.trim() : '';

  const playlist = await Playlist.create({
    userId: req.user.id,
    name,
    coverUrl,
    visibility: 'private',
    likesCount: 0,
    songs: [],
  });

  success(res, playlist.toSafeObject(), 201);
});

export const getPlaylist = asyncHandler(async (req, res) => {
  const playlist = await findUserPlaylist(req.user.id, req.params.id);
  success(res, playlist.toSafeObject({ songSort: req.query.sort }));
});

export const updatePlaylist = asyncHandler(async (req, res) => {
  const playlist = await findUserPlaylist(req.user.id, req.params.id);

  if (req.body.name !== undefined) {
    playlist.name = validatePlaylistName(req.body.name);
  }
  if (req.body.coverUrl !== undefined) {
    if (typeof req.body.coverUrl !== 'string') {
      throw new AppError('coverUrl must be a string', 400);
    }
    playlist.coverUrl = req.body.coverUrl.trim();
  }

  await playlist.save();
  success(res, playlist.toSafeObject());
});

export const deletePlaylist = asyncHandler(async (req, res) => {
  const playlist = await findUserPlaylist(req.user.id, req.params.id);
  await playlist.deleteOne();
  success(res, { id: playlist._id.toString(), deleted: true });
});

export const addSongToPlaylist = asyncHandler(async (req, res) => {
  const payload = validateSongPayload(req.body);
  const playlist = await findUserPlaylist(req.user.id, req.params.id);

  const alreadyExists = playlist.songs.some(
    (song) => song.songId === payload.songId
  );
  if (!alreadyExists) {
    playlist.songs.push({ ...payload, addedAt: new Date() });
    await playlist.save();
  }

  success(res, {
    playlist: playlist.toSafeObject(),
    added: !alreadyExists,
  });
});

export const removeSongFromPlaylist = asyncHandler(async (req, res) => {
  const { id, songId } = req.params;
  const playlist = await findUserPlaylist(req.user.id, id);

  const beforeCount = playlist.songs.length;
  playlist.songs = playlist.songs.filter((song) => song.songId !== songId);

  if (playlist.songs.length === beforeCount) {
    throw new AppError('Song not found in playlist', 404);
  }

  await playlist.save();
  success(res, {
    playlist: playlist.toSafeObject(),
    songId,
    removed: true,
  });
});

export const getPlaylistsContainingSong = asyncHandler(async (req, res) => {
  const songId =
    typeof req.params.songId === 'string' ? req.params.songId.trim() : '';
  if (!songId) {
    throw new AppError('songId is required', 400);
  }

  const playlists = await Playlist.find({
    userId: req.user.id,
    'songs.songId': songId,
  }).select('_id');

  success(res, {
    playlistIds: playlists.map((playlist) => playlist._id.toString()),
  });
});

export const addSongToPlaylists = asyncHandler(async (req, res) => {
  const { playlistIds } = req.body;
  if (!Array.isArray(playlistIds) || playlistIds.length === 0) {
    throw new AppError('playlistIds array is required', 400);
  }

  const payload = validateSongPayload(req.body);
  const uniqueIds = [...new Set(playlistIds.map((id) => String(id)))];

  for (const id of uniqueIds) {
    assertValidObjectId(id);
  }

  const playlists = await Playlist.find({
    userId: req.user.id,
    _id: { $in: uniqueIds },
  });

  if (playlists.length === 0) {
    throw new AppError('No matching playlists found', 404);
  }

  let added = 0;
  let skipped = 0;

  await Promise.all(
    playlists.map(async (playlist) => {
      const alreadyExists = playlist.songs.some(
        (song) => song.songId === payload.songId
      );
      if (alreadyExists) {
        skipped += 1;
        return;
      }
      playlist.songs.push({ ...payload, addedAt: new Date() });
      await playlist.save();
      added += 1;
    })
  );

  success(res, {
    added,
    skipped,
    playlists: playlists.map((playlist) => playlist.toListObject()),
  });
});
