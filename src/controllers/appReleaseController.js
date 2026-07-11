import { success } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  deleteRelease,
  getReleaseById,
  listReleases,
  publishExistingRelease,
  publishNewRelease,
  updateRelease,
} from '../services/appReleaseService.js';

export const getAppReleases = asyncHandler(async (req, res) => {
  const releases = await listReleases();
  success(res, releases);
});

export const getAppRelease = asyncHandler(async (req, res) => {
  const release = await getReleaseById(req.params.id);
  success(res, release);
});

export const createAppRelease = asyncHandler(async (req, res) => {
  const release = await publishNewRelease(req.body);
  success(res, release, 201);
});

export const patchAppRelease = asyncHandler(async (req, res) => {
  const release = await updateRelease(req.params.id, req.body);
  success(res, release);
});

export const removeAppRelease = asyncHandler(async (req, res) => {
  const result = await deleteRelease(req.params.id);
  success(res, result);
});

export const publishAppRelease = asyncHandler(async (req, res) => {
  const release = await publishExistingRelease(req.params.id);
  success(res, release);
});
