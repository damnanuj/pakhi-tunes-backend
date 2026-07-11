import AppConfig from '../models/AppConfig.js';
import { success } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  APP_CONFIG_DEFAULTS,
  resolvePublicConfig,
  toAdminConfig,
  validateAppConfigPatchBody,
} from '../utils/appConfigShared.js';

export { APP_CONFIG_DEFAULTS };

export async function findLiveAppConfig() {
  return AppConfig.findOne().sort({ updatedAt: -1 });
}

/** Ensures a single AppConfig row exists for write operations. */
export async function ensureAppConfigDoc() {
  let doc = await findLiveAppConfig();
  if (doc) return doc;

  doc = await AppConfig.create({ ...APP_CONFIG_DEFAULTS });
  return doc;
}

export const getAppConfig = asyncHandler(async (req, res) => {
  const doc = await findLiveAppConfig();
  const clientVersion = req.get('x-app-version')?.trim() || null;
  success(res, resolvePublicConfig(doc, clientVersion));
});

export const getAdminAppConfig = asyncHandler(async (req, res) => {
  const doc = await findLiveAppConfig();
  success(res, toAdminConfig(doc));
});

export const updateAppConfig = asyncHandler(async (req, res) => {
  const updates = validateAppConfigPatchBody(req.body);
  const doc = await ensureAppConfigDoc();

  Object.assign(doc, updates);
  await doc.save();

  success(res, toAdminConfig(doc));
});

export const deleteAppConfig = asyncHandler(async (req, res) => {
  const doc = await findLiveAppConfig();
  if (doc) {
    await doc.deleteOne();
  }

  success(res, { deleted: true });
});
