import User from '../models/User.js';
import Favorite from '../models/Favorite.js';
import PlayHistory from '../models/PlayHistory.js';
import { terminateSessionsByHost } from '../services/sessionLifecycleService.js';
import { success, successPaginated } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePagination(query) {
  const limit = Math.max(1, Math.min(100, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  const offset = Math.max(0, parseInt(query.offset, 10) || DEFAULT_OFFSET);
  return { limit, offset };
}

export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  success(res, user.toSafeObject());
});

const AUDIO_QUALITIES = ['96kbps', '160kbps', '320kbps'];

export const updatePreferences = asyncHandler(async (req, res) => {
  const hasStream = Object.prototype.hasOwnProperty.call(req.body, 'streamQuality');
  const hasDownload = Object.prototype.hasOwnProperty.call(req.body, 'downloadQuality');

  if (!hasStream && !hasDownload) {
    throw new AppError('streamQuality or downloadQuality is required', 400);
  }

  const user = await User.findById(req.user.id);
  if (!user) throw new AppError('User not found', 404);

  if (hasStream) {
    const { streamQuality } = req.body;
    if (!AUDIO_QUALITIES.includes(streamQuality)) {
      throw new AppError('Invalid streamQuality', 400);
    }
    user.streamQuality = streamQuality;
  }

  if (hasDownload) {
    const { downloadQuality } = req.body;
    if (downloadQuality !== null && !AUDIO_QUALITIES.includes(downloadQuality)) {
      throw new AppError('Invalid downloadQuality', 400);
    }
    user.downloadQuality = downloadQuality;
  }

  await user.save();
  success(res, { user: user.toSafeObject() });
});

export const updateDiscoverable = asyncHandler(async (req, res) => {
  const { discoverable } = req.body;
  if (typeof discoverable !== 'boolean') {
    throw new AppError('discoverable must be a boolean', 400);
  }

  const user = await User.findById(req.user.id);
  if (!user) throw new AppError('User not found', 404);

  user.discoverable = discoverable;
  await user.save();

  if (!discoverable) {
    // Nearby listening only — private rooms stay intact until the host ends them.
    await terminateSessionsByHost(user._id, {
      source: 'discoverable-off',
      visibility: 'nearby',
    });
  }

  success(res, { user: user.toSafeObject() });
});

export const listUsersAdmin = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const filter = {};

  const search = req.query.search?.trim();
  if (search) {
    const regex = new RegExp(escapeRegex(search.slice(0, 100)), 'i');
    filter.$or = [{ name: regex }, { email: regex }];
  }

  const role = req.query.role?.trim();
  if (role === 'admin' || role === 'user') {
    filter.role = role;
  }

  if (req.query.isBanned === 'true') {
    filter.isBanned = true;
  } else if (req.query.isBanned === 'false') {
    filter.isBanned = false;
  }

  const [users, count] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit),
    User.countDocuments(filter),
  ]);

  const results = users.map((user) => user.toSafeObject());
  successPaginated(res, results, count, limit, offset, 200, req);
});

export const toggleUserBan = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.role === 'admin') {
    throw new AppError('Admin accounts cannot be banned', 400);
  }

  user.isBanned = !user.isBanned;
  await user.save();

  if (user.isBanned) {
    await terminateSessionsByHost(user._id, { source: 'user-banned' });
  }

  success(res, { user: user.toSafeObject() });
});

export const deleteUserAdmin = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.role === 'admin') {
    throw new AppError('Admin accounts cannot be deleted', 400);
  }

  const userId = user._id;

  await Promise.all([
    Favorite.deleteMany({ userId }),
    PlayHistory.deleteMany({ userId }),
    terminateSessionsByHost(userId, { source: 'user-deleted' }),
    User.deleteOne({ _id: userId }),
  ]);

  success(res, { deleted: true, id: userId.toString() });
});
