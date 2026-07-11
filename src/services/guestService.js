import Guest from '../models/Guest.js';
import AppListing from '../models/AppListing.js';

export const DEFAULT_APP_LISTING_SLUG =
  process.env.APP_LISTING_SLUG?.trim() || 'pakhi-tunes';

const VALID_PLATFORMS = new Set(['ios', 'android', 'web']);

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

export async function incrementAppListingDownload(slug = DEFAULT_APP_LISTING_SLUG) {
  const listing = await AppListing.findOneAndUpdate(
    { slug },
    { $inc: { downloadCount: 1 } },
    { new: true }
  );
  return listing;
}

export async function incrementAppListingConversion(slug = DEFAULT_APP_LISTING_SLUG) {
  const listing = await AppListing.findOneAndUpdate(
    { slug },
    { $inc: { conversionCount: 1 } },
    { new: true }
  );
  return listing;
}

export async function convertGuestToUser(deviceId, userId, slug = DEFAULT_APP_LISTING_SLUG) {
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  if (!normalizedDeviceId) {
    return null;
  }

  const guest = await Guest.findOne({ deviceId: normalizedDeviceId });
  if (!guest || guest.status === 'converted') {
    return guest;
  }

  const isFirstConversionForUser = !(await Guest.exists({
    status: 'converted',
    convertedUserId: userId,
  }));

  guest.status = 'converted';
  guest.convertedUserId = userId;
  guest.convertedAt = new Date();
  await guest.save();

  if (isFirstConversionForUser) {
    await incrementAppListingConversion(slug);
  }

  return guest;
}
