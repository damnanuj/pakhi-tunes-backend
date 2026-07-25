import { success, successPaginated } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  listDevices,
  registerDevice,
  unlinkUserFromDevice,
  unregisterDevice,
} from '../services/deviceService.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

function parsePagination(query) {
  const limit = Math.max(1, Math.min(100, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  const offset = Math.max(0, parseInt(query.offset, 10) || DEFAULT_OFFSET);
  return { limit, offset };
}

/**
 * POST /devices/register
 * Public (optionalAuth). Registers or updates a device FCM token.
 * Body: { installationId, fcmToken, platform?, deviceModel?, appVersion?, clearUser? }
 */
export const register = asyncHandler(async (req, res) => {
  const {
    installationId,
    fcmToken,
    platform,
    deviceModel,
    appVersion,
    clearUser,
  } = req.body ?? {};

  const userId = req.user?.id ?? null;
  const shouldClearUser = clearUser === true || clearUser === 'true';

  const device = await registerDevice({
    installationId,
    fcmToken,
    userId: shouldClearUser ? null : userId,
    platform,
    deviceModel,
    appVersion,
    clearUser: shouldClearUser,
  });

  const isNew = device.createdAt?.getTime?.() === device.updatedAt?.getTime?.();

  return success(
    res,
    {
      device: device.toSafeObject(),
      isNew,
    },
    isNew ? 201 : 200
  );
});

/**
 * POST /devices/unlink
 * Public (optionalAuth). Removes user association on logout.
 * Body: { installationId }
 */
export const unlink = asyncHandler(async (req, res) => {
  const installationId = req.body?.installationId;
  const device = await unlinkUserFromDevice(installationId);

  if (!device) {
    throw new AppError('Device not found', 404);
  }

  return success(res, { device: device.toSafeObject() });
});

/**
 * DELETE /devices/:installationId
 * Soft-deactivate a device.
 */
export const unregister = asyncHandler(async (req, res) => {
  const device = await unregisterDevice(req.params.installationId);

  if (!device) {
    throw new AppError('Device not found', 404);
  }

  return success(res, { device: device.toSafeObject() });
});

/**
 * GET /devices
 * Admin only. List devices with filters.
 */
export const list = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const { results, count } = await listDevices({
    status: req.query.status,
    platform: req.query.platform,
    userId: req.query.userId,
    search: req.query.search,
    limit,
    offset,
  });

  return successPaginated(res, results, count, limit, offset, 200, req);
});
