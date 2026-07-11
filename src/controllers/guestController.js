import Guest from '../models/Guest.js';
import { success, successPaginated } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  DEFAULT_APP_LISTING_SLUG,
  incrementAppListingDownload,
  normalizeDeviceId,
  normalizePlatform,
} from '../services/guestService.js';
import { GUEST_LISTENING_LIMIT_MS } from '../services/listeningService.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;
const GUEST_STATUSES = new Set(['active', 'inactive', 'converted', 'banned']);

function parsePagination(query) {
  const limit = Math.max(1, Math.min(100, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  const offset = Math.max(0, parseInt(query.offset, 10) || DEFAULT_OFFSET);
  return { limit, offset };
}

function resolveAppSlug(req) {
  return req.query.slug?.trim() || req.body?.slug?.trim() || DEFAULT_APP_LISTING_SLUG;
}

function guestListeningMeta(guest) {
  const totalListenedMs = guest?.totalListenedMs ?? 0;
  return {
    totalListenedMs,
    guestListeningLimitMs: GUEST_LISTENING_LIMIT_MS,
    guestRemainingMs: Math.max(0, GUEST_LISTENING_LIMIT_MS - totalListenedMs),
  };
}

export const pingGuest = asyncHandler(async (req, res) => {
  const deviceId = normalizeDeviceId(req.body.deviceId);
  if (!deviceId) {
    throw new AppError('deviceId is required', 400);
  }

  const platform = normalizePlatform(req.body.platform);
  const appVersion = String(req.body.appVersion ?? '').trim();
  const slug = resolveAppSlug(req);
  const now = new Date();

  let guest = await Guest.findOne({ deviceId });

  if (!guest) {
    guest = await Guest.create({
      deviceId,
      platform,
      appVersion,
      status: 'active',
      lastActiveAt: now,
    });

    await incrementAppListingDownload(slug);

    return success(
      res,
      {
        guest: guest.toSafeObject(),
        isNew: true,
        converted: false,
        ...guestListeningMeta(guest),
      },
      201
    );
  }

  if (guest.status === 'banned') {
    throw new AppError('This device has been suspended', 403);
  }

  if (guest.status === 'converted') {
    return success(res, {
      guest: guest.toSafeObject(),
      isNew: false,
      converted: true,
      ...guestListeningMeta(guest),
    });
  }

  const wasInactive = guest.status === 'inactive';

  guest.platform = platform;
  guest.appVersion = appVersion;
  guest.lastActiveAt = now;

  if (guest.status === 'inactive') {
    guest.status = 'active';
  }

  await guest.save();

  success(res, {
    guest: guest.toSafeObject(),
    isNew: false,
    converted: false,
    reactivated: wasInactive,
    ...guestListeningMeta(guest),
  });
});

export const listGuests = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const filter = {};

  const status = req.query.status?.trim();
  if (status) {
    if (!GUEST_STATUSES.has(status)) {
      throw new AppError('Invalid status filter', 400);
    }
    filter.status = status;
  }

  const platform = req.query.platform?.trim();
  if (platform) {
    filter.platform = normalizePlatform(platform);
  }

  const search = req.query.search?.trim();
  if (search) {
    filter.deviceId = { $regex: search, $options: 'i' };
  }

  const sortField = req.query.sort === 'createdAt' ? 'createdAt' : 'lastActiveAt';
  const sortOrder = req.query.order === 'asc' ? 1 : -1;

  const [guests, count] = await Promise.all([
    Guest.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip(offset)
      .limit(limit),
    Guest.countDocuments(filter),
  ]);

  const results = guests.map((guest) => guest.toSafeObject());
  successPaginated(res, results, count, limit, offset, 200, req);
});

export const getGuestStats = asyncHandler(async (_req, res) => {
  const [total, active, inactive, converted, banned, uniqueConvertedIds] =
    await Promise.all([
      Guest.countDocuments(),
      Guest.countDocuments({ status: 'active' }),
      Guest.countDocuments({ status: 'inactive' }),
      Guest.countDocuments({ status: 'converted' }),
      Guest.countDocuments({ status: 'banned' }),
      Guest.distinct('convertedUserId', {
        status: 'converted',
        convertedUserId: { $ne: null },
      }),
    ]);

  success(res, {
    total,
    active,
    inactive,
    converted,
    banned,
    uniqueConverted: uniqueConvertedIds.length,
  });
});

export const toggleGuestBan = asyncHandler(async (req, res) => {
  const guest = await Guest.findById(req.params.id);
  if (!guest) {
    throw new AppError('Guest not found', 404);
  }

  if (guest.status === 'converted') {
    throw new AppError('Converted guests cannot be banned', 400);
  }

  if (guest.status === 'banned') {
    guest.status = 'active';
    guest.lastActiveAt = new Date();
  } else {
    guest.status = 'banned';
  }

  await guest.save();
  success(res, { guest: guest.toSafeObject() });
});

export const deleteGuest = asyncHandler(async (req, res) => {
  const guest = await Guest.findByIdAndDelete(req.params.id);
  if (!guest) {
    throw new AppError('Guest not found', 404);
  }

  success(res, { deleted: true, id: guest._id.toString() });
});
