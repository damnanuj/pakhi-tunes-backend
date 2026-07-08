import mongoose from 'mongoose';
import AppConfig from '../models/AppConfig.js';
import AppRelease from '../models/AppRelease.js';
import { AppError } from '../utils/AppError.js';
import {
  configDocToReleaseSnapshot,
  normalizeReleaseSections,
  releasePayloadToAppConfig,
  releasePayloadToReleaseDoc,
  toReleaseListItem,
  validatePublishReleaseBody,
  validateReleasePatchBody,
} from '../utils/appConfigShared.js';
import { findLiveAppConfig } from '../controllers/appConfigController.js';

async function getLiveVersion() {
  const doc = await findLiveAppConfig();
  return doc?.latestVersion ?? null;
}

async function upsertArchivedRelease(snapshot, archiveOptions) {
  const existing = await AppRelease.findOne({ version: snapshot.version });

  if (existing) {
    existing.set({
      downloadUrl: snapshot.downloadUrl,
      updateTitle: snapshot.updateTitle,
      updateMessage: snapshot.updateMessage,
      forceUpdateTitle: snapshot.forceUpdateTitle,
      forceUpdateMessage: snapshot.forceUpdateMessage,
      releaseSections: snapshot.releaseSections,
      updateAvailable: snapshot.updateAvailable,
      forceUpdate: snapshot.forceUpdate,
      archivedAt: snapshot.archivedAt,
    });
    await existing.save(archiveOptions);
    return existing;
  }

  const created = await AppRelease.create([snapshot], archiveOptions);
  return created[0];
}

async function runInTransaction(work) {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();

    if (
      error?.message?.includes('Transaction numbers are only allowed') ||
      error?.code === 20
    ) {
      return work(null);
    }

    throw error;
  } finally {
    session.endSession();
  }
}

export async function bootstrapFromLiveConfig() {
  const count = await AppRelease.countDocuments();
  if (count > 0) return null;

  const liveDoc = await findLiveAppConfig();
  if (!liveDoc) return null;

  const snapshot = configDocToReleaseSnapshot(liveDoc);
  return AppRelease.create(snapshot);
}

export async function listReleases() {
  await bootstrapFromLiveConfig();

  const liveVersion = await getLiveVersion();
  const releases = await AppRelease.find().sort({ releasedAt: -1 });

  return releases.map((release) => toReleaseListItem(release, liveVersion));
}

export async function getReleaseById(id) {
  const release = await AppRelease.findById(id);
  if (!release) {
    throw new AppError('Release not found', 404);
  }

  const liveVersion = await getLiveVersion();
  return toReleaseListItem(release, liveVersion);
}

export async function publishNewRelease(body) {
  const payload = validatePublishReleaseBody(body);
  const liveVersion = await getLiveVersion();

  if (liveVersion && payload.version === liveVersion) {
    throw new AppError(
      'New version must be different from the current live version',
      400
    );
  }

  const duplicate = await AppRelease.findOne({ version: payload.version });
  if (duplicate) {
    throw new AppError('A release with this version already exists', 409);
  }

  const archivedAt = new Date();

  return runInTransaction(async (session) => {
    const archiveOptions = session ? { session } : {};

    const liveDoc = await findLiveAppConfig();
    if (liveDoc) {
      const snapshot = configDocToReleaseSnapshot(liveDoc, { archivedAt });
      await upsertArchivedRelease(snapshot, archiveOptions);
    }

    const previousLatestVersion = liveDoc?.latestVersion ?? null;
    const configData = releasePayloadToAppConfig(payload, previousLatestVersion);
    let nextLiveDoc = await findLiveAppConfig();

    if (nextLiveDoc) {
      nextLiveDoc.set(configData);
      await nextLiveDoc.save(archiveOptions);
    } else {
      const created = await AppConfig.create([configData], archiveOptions);
      nextLiveDoc = created[0];
    }

    const releaseDoc = releasePayloadToReleaseDoc(payload);
    const createdRelease = await AppRelease.create([releaseDoc], archiveOptions);

    return toReleaseListItem(
      createdRelease[0],
      nextLiveDoc.latestVersion ?? payload.version
    );
  });
}

export async function updateRelease(id, body) {
  const updates = validateReleasePatchBody(body);
  const release = await AppRelease.findById(id);

  if (!release) {
    throw new AppError('Release not found', 404);
  }

  const liveVersion = await getLiveVersion();
  if (release.version === liveVersion) {
    throw new AppError(
      'Cannot edit the live release here. Update live config on the App Config page.',
      400
    );
  }

  if ('version' in updates && updates.version !== release.version) {
    const duplicate = await AppRelease.findOne({ version: updates.version });
    if (duplicate && duplicate._id.toString() !== id) {
      throw new AppError('A release with this version already exists', 409);
    }
  }

  if ('releaseSections' in updates) {
    updates.releaseSections = normalizeReleaseSections(updates.releaseSections);
  }

  release.set(updates);
  await release.save();

  return toReleaseListItem(release, liveVersion);
}

export async function deleteRelease(id) {
  const release = await AppRelease.findById(id);

  if (!release) {
    throw new AppError('Release not found', 404);
  }

  const liveVersion = await getLiveVersion();
  if (release.version === liveVersion) {
    throw new AppError('Cannot delete the live release', 400);
  }

  await release.deleteOne();
  return { deleted: true, id };
}

export async function publishExistingRelease(id) {
  const release = await AppRelease.findById(id);
  if (!release) {
    throw new AppError('Release not found', 404);
  }

  const liveVersion = await getLiveVersion();
  if (release.version === liveVersion) {
    throw new AppError('This release is already live', 400);
  }

  const archivedAt = new Date();

  return runInTransaction(async (session) => {
    const archiveOptions = session ? { session } : {};

    const liveDoc = await findLiveAppConfig();
    if (liveDoc && liveDoc.latestVersion !== release.version) {
      const snapshot = configDocToReleaseSnapshot(liveDoc, { archivedAt });
      await upsertArchivedRelease(snapshot, archiveOptions);
    }

    const configData = {
      updateAvailable: false,
      forceUpdate: false,
      latestVersion: release.version,
      minSupportedVersion: release.version,
      softUpdateEnabled: false,
      downloadUrl: release.downloadUrl ?? '',
      updateTitle: release.updateTitle,
      updateMessage: release.updateMessage,
      forceUpdateTitle: release.forceUpdateTitle,
      forceUpdateMessage: release.forceUpdateMessage,
      releaseSections: normalizeReleaseSections(release.releaseSections),
    };

    let nextLiveDoc = await findLiveAppConfig();
    if (nextLiveDoc) {
      nextLiveDoc.set(configData);
      await nextLiveDoc.save(archiveOptions);
    } else {
      const created = await AppConfig.create([configData], archiveOptions);
      nextLiveDoc = created[0];
    }

    release.archivedAt = null;
    release.releasedAt = new Date();
    await release.save(archiveOptions);

    return toReleaseListItem(release, nextLiveDoc.latestVersion);
  });
}
