import AppConfig from '../models/AppConfig.js';
import { success } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

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

export const getAppConfig = asyncHandler(async (req, res) => {
  const doc = await ensureAppConfigDoc();
  success(res, toPublicConfig(doc));
});
