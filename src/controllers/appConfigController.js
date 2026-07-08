import AppConfig from '../models/AppConfig.js';
import { success } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const PATCHABLE_FIELDS = new Set([
  'updateAvailable',
  'forceUpdate',
  'latestVersion',
  'downloadUrl',
  'updateTitle',
  'updateMessage',
  'forceUpdateTitle',
  'forceUpdateMessage',
  'releaseSections',
]);

export const APP_CONFIG_DEFAULTS = {
  updateAvailable: false,
  forceUpdate: false,
  latestVersion: '1.0.0',
  downloadUrl: '',
  updateTitle: 'Update Available',
  updateMessage:
    'A new version of Pakhi Tunes is available. Please update for the best experience.',
  forceUpdateTitle: 'Update Required',
  forceUpdateMessage:
    'This version of Pakhi Tunes is no longer supported. Please update to continue using the app.',
  releaseSections: [],
};

function normalizeReleaseSections(sections) {
  if (!Array.isArray(sections)) return [];

  return sections
    .map((section) => {
      const title = String(section?.title ?? '').trim();
      const items = Array.isArray(section?.items)
        ? section.items
            .map((item) => String(item ?? '').trim())
            .filter(Boolean)
        : [];

      return { title, items };
    })
    .filter((section) => section.title && section.items.length > 0);
}

function toPublicConfig(doc) {
  const config = doc ?? APP_CONFIG_DEFAULTS;
  const forceUpdate = Boolean(config.forceUpdate);
  const updateAvailable = Boolean(config.updateAvailable);

  return {
    updateAvailable,
    forceUpdate,
    latestVersion: config.latestVersion ?? APP_CONFIG_DEFAULTS.latestVersion,
    downloadUrl: config.downloadUrl ?? '',
    title: forceUpdate
      ? (config.forceUpdateTitle ?? APP_CONFIG_DEFAULTS.forceUpdateTitle)
      : (config.updateTitle ?? APP_CONFIG_DEFAULTS.updateTitle),
    message: forceUpdate
      ? (config.forceUpdateMessage ?? APP_CONFIG_DEFAULTS.forceUpdateMessage)
      : (config.updateMessage ?? APP_CONFIG_DEFAULTS.updateMessage),
    releaseSections: normalizeReleaseSections(config.releaseSections),
  };
}

/** Ensures a single AppConfig row exists so it can be edited in MongoDB Compass/Atlas. */
export async function ensureAppConfigDoc() {
  let doc = await AppConfig.findOne().sort({ updatedAt: -1 });
  if (doc) return doc;

  doc = await AppConfig.create({ ...APP_CONFIG_DEFAULTS });
  return doc;
}

function validatePatchBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError('Request body must be a JSON object', 400);
  }

  const unknownKeys = Object.keys(body).filter((key) => !PATCHABLE_FIELDS.has(key));
  if (unknownKeys.length > 0) {
    throw new AppError(`Unknown fields: ${unknownKeys.join(', ')}`, 400);
  }

  const updates = {};

  if ('updateAvailable' in body) {
    if (typeof body.updateAvailable !== 'boolean') {
      throw new AppError('updateAvailable must be a boolean', 400);
    }
    updates.updateAvailable = body.updateAvailable;
  }

  if ('forceUpdate' in body) {
    if (typeof body.forceUpdate !== 'boolean') {
      throw new AppError('forceUpdate must be a boolean', 400);
    }
    updates.forceUpdate = body.forceUpdate;
  }

  for (const key of [
    'latestVersion',
    'downloadUrl',
    'updateTitle',
    'updateMessage',
    'forceUpdateTitle',
    'forceUpdateMessage',
  ]) {
    if (key in body) {
      if (typeof body[key] !== 'string') {
        throw new AppError(`${key} must be a string`, 400);
      }
      updates[key] = body[key];
    }
  }

  if ('releaseSections' in body) {
    if (!Array.isArray(body.releaseSections)) {
      throw new AppError('releaseSections must be an array', 400);
    }
    updates.releaseSections = body.releaseSections;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('At least one field is required', 400);
  }

  return updates;
}

export const getAppConfig = asyncHandler(async (req, res) => {
  const doc = await ensureAppConfigDoc();
  success(res, toPublicConfig(doc));
});

export const updateAppConfig = asyncHandler(async (req, res) => {
  const updates = validatePatchBody(req.body);
  const doc = await ensureAppConfigDoc();

  Object.assign(doc, updates);
  await doc.save();

  success(res, toPublicConfig(doc));
});
