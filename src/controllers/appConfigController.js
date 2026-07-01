import AppConfig from '../models/AppConfig.js';
import { success } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const DEFAULTS = {
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
};

function toPublicConfig(doc) {
  const config = doc ?? DEFAULTS;
  const forceUpdate = Boolean(config.forceUpdate);
  const updateAvailable = Boolean(config.updateAvailable);

  return {
    updateAvailable,
    forceUpdate,
    latestVersion: config.latestVersion ?? DEFAULTS.latestVersion,
    downloadUrl: config.downloadUrl ?? '',
    title: forceUpdate
      ? (config.forceUpdateTitle ?? DEFAULTS.forceUpdateTitle)
      : (config.updateTitle ?? DEFAULTS.updateTitle),
    message: forceUpdate
      ? (config.forceUpdateMessage ?? DEFAULTS.forceUpdateMessage)
      : (config.updateMessage ?? DEFAULTS.updateMessage),
  };
}

export const getAppConfig = asyncHandler(async (req, res) => {
  const doc = await AppConfig.findOne().sort({ updatedAt: -1 }).lean();
  success(res, toPublicConfig(doc));
});
