import AppConfig from '../models/AppConfig.js';
import { success } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  APP_CONFIG_DEFAULTS,
  enrichConfigFromLiveRelease,
  getLiveConfigRepairUpdates,
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
  const enriched = await enrichConfigFromLiveRelease(doc);
  const clientVersion = req.get('x-app-version')?.trim() || null;
  success(res, resolvePublicConfig(enriched, clientVersion));
});

export const getAdminAppConfig = asyncHandler(async (req, res) => {
  const doc = await findLiveAppConfig();
  const enriched = await enrichConfigFromLiveRelease(doc);

  if (doc) {
    const repairUpdates = getLiveConfigRepairUpdates(doc, enriched);
    if (Object.keys(repairUpdates).length > 0) {
      doc.set(repairUpdates);
      await doc.save();
    }
  }

  success(res, toAdminConfig(enriched, doc));
});

export const updateAppConfig = asyncHandler(async (req, res) => {
  const updates = validateAppConfigPatchBody(req.body);
  const doc = await ensureAppConfigDoc();

  Object.assign(doc, updates);
  await doc.save();

  const enriched = await enrichConfigFromLiveRelease(doc);
  success(res, toAdminConfig(enriched, doc));
});

export const deleteAppConfig = asyncHandler(async (req, res) => {
  const doc = await findLiveAppConfig();
  if (doc) {
    await doc.deleteOne();
  }

  success(res, { deleted: true });
});
