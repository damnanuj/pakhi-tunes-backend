import AppRelease from '../models/AppRelease.js';
import { AppError } from './AppError.js';
import { isLessThan } from './semverCompare.js';

/** Mobile update prompts open the portfolio project page, not the APK URL. */
export const IN_APP_UPDATE_LANDING_URL =
  'https://www.damnanuj.com/projects/pakhi-tunes';

export const APP_CONFIG_DEFAULTS = {
  updateAvailable: false,
  forceUpdate: false,
  latestVersion: '1.0.0',
  minSupportedVersion: '1.0.0',
  softUpdateEnabled: false,
  downloadUrl: '',
  updateTitle: 'Update Available',
  updateMessage:
    'A new version of Pakhi Tunes is available. Please update for the best experience.',
  forceUpdateTitle: 'Update Required',
  forceUpdateMessage:
    'This version of Pakhi Tunes is no longer supported. Please update to continue using the app.',
  releaseSections: [],
};

export const PATCHABLE_APP_CONFIG_FIELDS = new Set([
  'updateAvailable',
  'forceUpdate',
  'latestVersion',
  'minSupportedVersion',
  'softUpdateEnabled',
  'downloadUrl',
  'updateTitle',
  'updateMessage',
  'forceUpdateTitle',
  'forceUpdateMessage',
  'releaseSections',
]);

export const PATCHABLE_RELEASE_FIELDS = new Set([
  'version',
  'downloadUrl',
  'updateTitle',
  'updateMessage',
  'forceUpdateTitle',
  'forceUpdateMessage',
  'releaseSections',
]);

export const PUBLISH_RELEASE_FIELDS = new Set([
  'version',
  'downloadUrl',
  'updateTitle',
  'updateMessage',
  'forceUpdateTitle',
  'forceUpdateMessage',
  'releaseSections',
]);

export const RELEASE_SECTION_DEFAULTS = [
  { title: "What's new", items: ['', '', ''] },
  { title: 'Bug fixes', items: ['', '', ''] },
  { title: 'Improvements', items: ['', '', ''] },
];

export function toPlainConfig(config) {
  if (!config) return null;
  if (typeof config.toObject === 'function') {
    return config.toObject({ virtuals: true });
  }
  return config;
}

export function normalizeConfigFields(config = APP_CONFIG_DEFAULTS) {
  const source = toPlainConfig(config) ?? APP_CONFIG_DEFAULTS;
  const latestVersion = source.latestVersion ?? APP_CONFIG_DEFAULTS.latestVersion;
  const minSupportedVersion =
    source.minSupportedVersion ?? latestVersion ?? APP_CONFIG_DEFAULTS.minSupportedVersion;

  return {
    ...APP_CONFIG_DEFAULTS,
    ...source,
    latestVersion,
    minSupportedVersion,
    softUpdateEnabled: Boolean(source.softUpdateEnabled),
  };
}

async function findReleaseForVersion(version) {
  if (!version) return null;

  const liveRelease = await AppRelease.findOne({
    version,
    archivedAt: null,
  }).lean();

  if (liveRelease) return liveRelease;

  return AppRelease.findOne({ version }).sort({ releasedAt: -1 }).lean();
}

export async function enrichConfigFromLiveRelease(config) {
  const normalized = normalizeConfigFields(config);
  const hasDownloadUrl = Boolean(normalized.downloadUrl?.trim());
  const hasReleaseSections =
    normalizeReleaseSections(normalized.releaseSections).length > 0;

  if (hasDownloadUrl && hasReleaseSections) {
    return normalized;
  }

  const release = await findReleaseForVersion(normalized.latestVersion);
  if (!release) return normalized;

  return {
    ...normalized,
    downloadUrl: hasDownloadUrl ? normalized.downloadUrl : (release.downloadUrl ?? ''),
    releaseSections: hasReleaseSections
      ? normalizeReleaseSections(normalized.releaseSections)
      : normalizeReleaseSections(release.releaseSections),
    updatedAt: normalized.updatedAt ?? release.updatedAt ?? null,
  };
}

export function getLiveConfigRepairUpdates(currentConfig, enrichedConfig) {
  const current = normalizeConfigFields(currentConfig);
  const enriched = normalizeConfigFields(enrichedConfig);
  const updates = {};

  if (!current.downloadUrl?.trim() && enriched.downloadUrl?.trim()) {
    updates.downloadUrl = enriched.downloadUrl;
  }

  if (
    normalizeReleaseSections(current.releaseSections).length === 0 &&
    normalizeReleaseSections(enriched.releaseSections).length > 0
  ) {
    updates.releaseSections = enriched.releaseSections;
  }

  return updates;
}

export function normalizeReleaseSections(sections) {
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

function buildVersionPolicySummary(config) {
  const latestVersion = config.latestVersion ?? APP_CONFIG_DEFAULTS.latestVersion;
  const minSupportedVersion =
    config.minSupportedVersion ?? latestVersion ?? APP_CONFIG_DEFAULTS.minSupportedVersion;

  return {
    softTargetsBelow: config.softUpdateEnabled ? latestVersion : null,
    forceTargetsBelow: minSupportedVersion,
  };
}

function resolveUpdateFlags(config, clientVersion) {
  const normalized = normalizeConfigFields(config);

  if (!clientVersion) {
    return {
      forceUpdate: Boolean(normalized.forceUpdate),
      updateAvailable: Boolean(normalized.updateAvailable),
    };
  }

  if (normalized.forceUpdate) {
    return { forceUpdate: true, updateAvailable: false };
  }

  const latestVersion = normalized.latestVersion;
  const minSupportedVersion = normalized.minSupportedVersion;

  if (isLessThan(clientVersion, minSupportedVersion)) {
    return { forceUpdate: true, updateAvailable: false };
  }

  if (
    normalized.softUpdateEnabled &&
    isLessThan(clientVersion, latestVersion)
  ) {
    return { forceUpdate: false, updateAvailable: true };
  }

  return { forceUpdate: false, updateAvailable: false };
}

export function resolvePublicConfig(doc, clientVersion = null) {
  const config = normalizeConfigFields(doc ?? APP_CONFIG_DEFAULTS);
  const { forceUpdate, updateAvailable } = resolveUpdateFlags(
    config,
    clientVersion?.trim() || null
  );

  return {
    updateAvailable,
    forceUpdate,
    latestVersion: config.latestVersion,
    downloadUrl: IN_APP_UPDATE_LANDING_URL,
    title: forceUpdate ? config.forceUpdateTitle : config.updateTitle,
    message: forceUpdate ? config.forceUpdateMessage : config.updateMessage,
    releaseSections: normalizeReleaseSections(config.releaseSections),
    updatedAt: config.updatedAt
      ? new Date(config.updatedAt).toISOString()
      : null,
  };
}

/** @deprecated Use resolvePublicConfig */
export function toPublicConfig(doc) {
  return resolvePublicConfig(doc, null);
}

export function toAdminConfig(configInput, doc = null) {
  const config = normalizeConfigFields(configInput ?? APP_CONFIG_DEFAULTS);
  const versionPolicySummary = buildVersionPolicySummary(config);
  const exists = doc != null ? Boolean(doc) : configInput != null;

  return {
    exists,
    updateAvailable: Boolean(config.updateAvailable),
    forceUpdate: Boolean(config.forceUpdate),
    latestVersion: config.latestVersion,
    minSupportedVersion: config.minSupportedVersion,
    softUpdateEnabled: Boolean(config.softUpdateEnabled),
    downloadUrl: config.downloadUrl ?? '',
    updateTitle: config.updateTitle,
    updateMessage: config.updateMessage,
    forceUpdateTitle: config.forceUpdateTitle,
    forceUpdateMessage: config.forceUpdateMessage,
    releaseSections: normalizeReleaseSections(config.releaseSections),
    versionPolicySummary,
    updatedAt: config.updatedAt
      ? new Date(config.updatedAt).toISOString()
      : null,
  };
}

export function configDocToReleaseSnapshot(doc, { archivedAt = null } = {}) {
  const config = normalizeConfigFields(doc ?? APP_CONFIG_DEFAULTS);
  const now = new Date();

  return {
    version: config.latestVersion,
    downloadUrl: config.downloadUrl ?? '',
    updateTitle: config.updateTitle,
    updateMessage: config.updateMessage,
    forceUpdateTitle: config.forceUpdateTitle,
    forceUpdateMessage: config.forceUpdateMessage,
    releaseSections: normalizeReleaseSections(config.releaseSections),
    updateAvailable: Boolean(config.updateAvailable),
    forceUpdate: Boolean(config.forceUpdate),
    releasedAt: config.updatedAt ? new Date(config.updatedAt) : now,
    archivedAt,
  };
}

export function toReleaseListItem(release, liveVersion) {
  return {
    id: release._id.toString(),
    version: release.version,
    downloadUrl: release.downloadUrl ?? '',
    updateTitle: release.updateTitle,
    updateMessage: release.updateMessage,
    forceUpdateTitle: release.forceUpdateTitle,
    forceUpdateMessage: release.forceUpdateMessage,
    releaseSections: normalizeReleaseSections(release.releaseSections),
    updateAvailable: Boolean(release.updateAvailable),
    forceUpdate: Boolean(release.forceUpdate),
    releasedAt: release.releasedAt
      ? new Date(release.releasedAt).toISOString()
      : null,
    archivedAt: release.archivedAt
      ? new Date(release.archivedAt).toISOString()
      : null,
    isLive: release.version === liveVersion,
    sectionCount: normalizeReleaseSections(release.releaseSections).length,
  };
}

function validateBooleanField(body, key, updates) {
  if (key in body) {
    if (typeof body[key] !== 'boolean') {
      throw new AppError(`${key} must be a boolean`, 400);
    }
    updates[key] = body[key];
  }
}

function validateStringField(body, key, updates) {
  if (key in body) {
    if (typeof body[key] !== 'string') {
      throw new AppError(`${key} must be a string`, 400);
    }
    updates[key] = body[key];
  }
}

export function validateAppConfigPatchBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError('Request body must be a JSON object', 400);
  }

  const unknownKeys = Object.keys(body).filter(
    (key) => !PATCHABLE_APP_CONFIG_FIELDS.has(key)
  );
  if (unknownKeys.length > 0) {
    throw new AppError(`Unknown fields: ${unknownKeys.join(', ')}`, 400);
  }

  const updates = {};

  validateBooleanField(body, 'updateAvailable', updates);
  validateBooleanField(body, 'forceUpdate', updates);
  validateBooleanField(body, 'softUpdateEnabled', updates);

  for (const key of [
    'latestVersion',
    'minSupportedVersion',
    'downloadUrl',
    'updateTitle',
    'updateMessage',
    'forceUpdateTitle',
    'forceUpdateMessage',
  ]) {
    validateStringField(body, key, updates);
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

  if ('minSupportedVersion' in updates) {
    updates.minSupportedVersion = updates.minSupportedVersion.trim();
    if (!updates.minSupportedVersion) {
      throw new AppError('minSupportedVersion is required', 400);
    }
  }

  return updates;
}

export function validateReleasePatchBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError('Request body must be a JSON object', 400);
  }

  const unknownKeys = Object.keys(body).filter(
    (key) => !PATCHABLE_RELEASE_FIELDS.has(key)
  );
  if (unknownKeys.length > 0) {
    throw new AppError(`Unknown fields: ${unknownKeys.join(', ')}`, 400);
  }

  const updates = {};

  for (const key of [
    'version',
    'downloadUrl',
    'updateTitle',
    'updateMessage',
    'forceUpdateTitle',
    'forceUpdateMessage',
  ]) {
    validateStringField(body, key, updates);
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

  if ('version' in updates) {
    updates.version = updates.version.trim();
    if (!updates.version) {
      throw new AppError('version is required', 400);
    }
  }

  return updates;
}

export function validatePublishReleaseBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError('Request body must be a JSON object', 400);
  }

  const unknownKeys = Object.keys(body).filter(
    (key) => !PUBLISH_RELEASE_FIELDS.has(key)
  );
  if (unknownKeys.length > 0) {
    throw new AppError(`Unknown fields: ${unknownKeys.join(', ')}`, 400);
  }

  const version = String(body.version ?? '').trim();
  if (!version) {
    throw new AppError('version is required', 400);
  }

  if ('releaseSections' in body && !Array.isArray(body.releaseSections)) {
    throw new AppError('releaseSections must be an array', 400);
  }

  return {
    version,
    downloadUrl:
      typeof body.downloadUrl === 'string'
        ? body.downloadUrl
        : APP_CONFIG_DEFAULTS.downloadUrl,
    updateTitle:
      typeof body.updateTitle === 'string'
        ? body.updateTitle
        : APP_CONFIG_DEFAULTS.updateTitle,
    updateMessage:
      typeof body.updateMessage === 'string'
        ? body.updateMessage
        : APP_CONFIG_DEFAULTS.updateMessage,
    forceUpdateTitle:
      typeof body.forceUpdateTitle === 'string'
        ? body.forceUpdateTitle
        : APP_CONFIG_DEFAULTS.forceUpdateTitle,
    forceUpdateMessage:
      typeof body.forceUpdateMessage === 'string'
        ? body.forceUpdateMessage
        : APP_CONFIG_DEFAULTS.forceUpdateMessage,
    releaseSections: body.releaseSections ?? [],
  };
}

export function releasePayloadToAppConfig(payload, previousLatestVersion = null) {
  const minSupportedVersion =
    previousLatestVersion?.trim() ||
    payload.version ||
    APP_CONFIG_DEFAULTS.minSupportedVersion;

  return {
    updateAvailable: false,
    forceUpdate: false,
    latestVersion: payload.version,
    minSupportedVersion,
    softUpdateEnabled: true,
    downloadUrl: payload.downloadUrl ?? '',
    updateTitle: payload.updateTitle ?? APP_CONFIG_DEFAULTS.updateTitle,
    updateMessage: payload.updateMessage ?? APP_CONFIG_DEFAULTS.updateMessage,
    forceUpdateTitle:
      payload.forceUpdateTitle ?? APP_CONFIG_DEFAULTS.forceUpdateTitle,
    forceUpdateMessage:
      payload.forceUpdateMessage ?? APP_CONFIG_DEFAULTS.forceUpdateMessage,
    releaseSections: payload.releaseSections ?? [],
  };
}

export function releasePayloadToReleaseDoc(payload, { archivedAt = null } = {}) {
  const now = new Date();

  return {
    version: payload.version,
    downloadUrl: payload.downloadUrl ?? '',
    updateTitle: payload.updateTitle ?? APP_CONFIG_DEFAULTS.updateTitle,
    updateMessage: payload.updateMessage ?? APP_CONFIG_DEFAULTS.updateMessage,
    forceUpdateTitle:
      payload.forceUpdateTitle ?? APP_CONFIG_DEFAULTS.forceUpdateTitle,
    forceUpdateMessage:
      payload.forceUpdateMessage ?? APP_CONFIG_DEFAULTS.forceUpdateMessage,
    releaseSections: normalizeReleaseSections(payload.releaseSections ?? []),
    updateAvailable: false,
    forceUpdate: false,
    releasedAt: now,
    archivedAt,
  };
}
