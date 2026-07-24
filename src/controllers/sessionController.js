import ActiveSession from '../models/ActiveSession.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import { success } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateUniqueRoomCode } from '../utils/roomCode.js';

const DEFAULT_RADIUS_METERS = 500;
const MAX_RADIUS_METERS = 5000;

function parseCoordinates(lat, lng) {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new AppError('Valid lat and lng query parameters are required', 400);
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new AppError('Invalid coordinates', 400);
  }
  return { latitude, longitude };
}

function parseRadius(radius) {
  const parsed = parseInt(radius, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_RADIUS_METERS;
  }
  return Math.min(parsed, MAX_RADIUS_METERS);
}

export const upsertSession = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new AppError('User not found', 404);
  if (!user.discoverable) {
    throw new AppError('Enable nearby listening in your profile to host a session', 403);
  }

  const {
    trackId,
    trackTitle,
    trackArtist,
    trackArtwork,
    trackUri,
    trackDuration,
    playing,
    positionMs,
    latitude,
    longitude,
  } = req.body;

  if (!trackId) throw new AppError('trackId is required', 400);
  const { latitude: lat, longitude: lng } = parseCoordinates(latitude, longitude);

  const session = await ActiveSession.findOneAndUpdate(
    { hostId: req.user.id },
    {
      $set: {
        hostId: req.user.id,
        hostName: user.name,
        hostAvatar: user.avatar ?? null,
        trackId,
        trackTitle: trackTitle ?? '',
        trackArtist: trackArtist ?? '',
        trackArtwork: trackArtwork ?? '',
        trackUri: trackUri ?? '',
        trackDuration: Number(trackDuration) || 0,
        playing: playing !== false,
        positionMs: Math.max(0, Number(positionMs) || 0),
        visibility: 'nearby',
        location: {
          type: 'Point',
          coordinates: [lng, lat],
        },
      },
      $unset: { roomCode: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  success(res, { session: session.toPublicObject() }, 200);
});

export const createPrivateRoom = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new AppError('User not found', 404);

  const {
    trackId,
    trackTitle,
    trackArtist,
    trackArtwork,
    trackUri,
    trackDuration,
    playing,
    positionMs,
  } = req.body;

  if (!trackId) throw new AppError('trackId is required', 400);

  const existing = await ActiveSession.findOne({ hostId: req.user.id });
  let roomCode = existing?.visibility === 'private' ? existing.roomCode : null;
  if (!roomCode) {
    roomCode = await generateUniqueRoomCode();
  }

  const session = await ActiveSession.findOneAndUpdate(
    { hostId: req.user.id },
    {
      $set: {
        hostId: req.user.id,
        hostName: user.name,
        hostAvatar: user.avatar ?? null,
        trackId,
        trackTitle: trackTitle ?? '',
        trackArtist: trackArtist ?? '',
        trackArtwork: trackArtwork ?? '',
        trackUri: trackUri ?? '',
        trackDuration: Number(trackDuration) || 0,
        playing: playing !== false,
        positionMs: Math.max(0, Number(positionMs) || 0),
        visibility: 'private',
        roomCode,
      },
      $unset: { location: 1 },
    },
    // Avoid nested location.type default creating { type: 'Point' } without coordinates
    { upsert: true, new: true, setDefaultsOnInsert: false }
  );

  success(res, { session: session.toPublicObject() }, 200);
});

export const getSessionByCode = asyncHandler(async (req, res) => {
  const code = String(req.params.code ?? '').trim();
  if (!/^\d{4}$/.test(code)) {
    throw new AppError('Room code must be a 4-digit number', 400);
  }

  const session = await ActiveSession.findOne({
    roomCode: code,
    visibility: 'private',
  });
  if (!session) {
    throw new AppError('Room not found', 404);
  }

  success(res, { session: session.toPublicObject() });
});

export const getNearbySessions = asyncHandler(async (req, res) => {
  const { latitude, longitude } = parseCoordinates(req.query.lat, req.query.lng);
  const radiusMeters = parseRadius(req.query.radius);

  const sessions = await ActiveSession.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [longitude, latitude] },
        distanceField: 'distanceMeters',
        maxDistance: radiusMeters,
        spherical: true,
        query: {
          hostId: { $ne: new mongoose.Types.ObjectId(req.user.id) },
          visibility: { $ne: 'private' },
          'location.coordinates.0': { $exists: true },
        },
      },
    },
    { $sort: { distanceMeters: 1 } },
    { $limit: 50 },
  ]);

  const results = sessions.map((s) => ({
    id: s._id.toString(),
    hostId: s.hostId.toString(),
    hostName: s.hostName ?? 'Listener',
    hostAvatar: s.hostAvatar ?? null,
    trackId: s.trackId,
    trackTitle: s.trackTitle ?? '',
    trackArtist: s.trackArtist ?? '',
    trackArtwork: s.trackArtwork ?? '',
    trackUri: s.trackUri ?? '',
    trackDuration: s.trackDuration ?? 0,
    playing: s.playing,
    positionMs: s.positionMs,
    listenerCount: s.listenerCount,
    visibility: s.visibility ?? 'nearby',
    roomCode: s.roomCode ?? null,
    distanceMeters: Math.round(s.distanceMeters ?? 0),
    updatedAt: s.updatedAt,
  }));

  success(res, { sessions: results, radiusMeters });
});

export const deleteSession = asyncHandler(async (req, res) => {
  const session = await ActiveSession.findById(req.params.id);
  if (!session) throw new AppError('Session not found', 404);
  if (session.hostId.toString() !== req.user.id) {
    throw new AppError('Only the host can stop this session', 403);
  }
  await session.deleteOne();
  success(res, { stopped: true });
});

export const updateSessionPosition = asyncHandler(async (req, res) => {
  const session = await ActiveSession.findById(req.params.id);
  if (!session) throw new AppError('Session not found', 404);
  if (session.hostId.toString() !== req.user.id) {
    throw new AppError('Only the host can update this session', 403);
  }

  const { positionMs, playing, latitude, longitude, trackId } = req.body;
  if (positionMs !== undefined) {
    session.positionMs = Math.max(0, Number(positionMs) || 0);
  }
  if (playing !== undefined) session.playing = Boolean(playing);
  if (trackId) session.trackId = trackId;
  if (latitude !== undefined && longitude !== undefined) {
    const coords = parseCoordinates(latitude, longitude);
    session.location = {
      type: 'Point',
      coordinates: [coords.longitude, coords.latitude],
    };
  }

  await session.save();
  success(res, { session: session.toPublicObject() });
});

export const getMySession = asyncHandler(async (req, res) => {
  const session = await ActiveSession.findOne({ hostId: req.user.id });
  if (!session) {
    success(res, { session: null });
    return;
  }
  success(res, { session: session.toPublicObject() });
});
