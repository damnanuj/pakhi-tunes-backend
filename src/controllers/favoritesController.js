import Favorite from '../models/Favorite.js';
import { success, successPaginated } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

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
    durationSec:
      typeof body.durationSec === 'number' && body.durationSec >= 0
        ? body.durationSec
        : 0,
    uri: typeof body.uri === 'string' ? body.uri : '',
    encryptedId:
      typeof body.encryptedId === 'string'
        ? body.encryptedId.trim()
        : typeof body.encrypted_id === 'string'
          ? body.encrypted_id.trim()
          : '',
  };
}

export const getFavorites = asyncHandler(async (req, res) => {
  const limit = Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || DEFAULT_OFFSET);

  const filter = { userId: req.user.id };

  const [favorites, count] = await Promise.all([
    Favorite.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit),
    Favorite.countDocuments(filter),
  ]);

  successPaginated(
    res,
    favorites.map((f) => f.toSafeObject()),
    count,
    limit,
    offset,
    200,
    req
  );
});

export const addFavorite = asyncHandler(async (req, res) => {
  const payload = validateSongPayload(req.body);

  const existing = await Favorite.findOne({
    userId: req.user.id,
    songId: payload.songId,
  });

  if (existing) {
    return success(res, { favorite: existing.toSafeObject(), isFavorited: true });
  }

  const favorite = await Favorite.create({
    userId: req.user.id,
    ...payload,
  });

  success(res, { favorite: favorite.toSafeObject(), isFavorited: true }, 201);
});

export const removeFavorite = asyncHandler(async (req, res) => {
  const { songId } = req.params;
  const favorite = await Favorite.findOneAndDelete({
    userId: req.user.id,
    songId,
  });

  if (!favorite) {
    throw new AppError('Favorite not found', 404);
  }

  success(res, { songId, isFavorited: false });
});

export const getFavoriteStatus = asyncHandler(async (req, res) => {
  const { songId } = req.params;
  const favorite = await Favorite.findOne({
    userId: req.user.id,
    songId,
  });

  success(res, { songId, isFavorited: Boolean(favorite) });
});
