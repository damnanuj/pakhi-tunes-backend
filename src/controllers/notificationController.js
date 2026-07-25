import { success, successPaginated } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  cancelNotification,
  createNotification,
  deleteNotification,
  getNotificationDetail,
  getNotificationStats,
  listNotifications,
  sendNotification,
} from '../services/notificationService.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

function parsePagination(query) {
  const limit = Math.max(1, Math.min(100, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  const offset = Math.max(0, parseInt(query.offset, 10) || DEFAULT_OFFSET);
  return { limit, offset };
}

/**
 * POST /notifications
 * Create a notification. Pass sendNow=true to send immediately.
 */
export const create = asyncHandler(async (req, res) => {
  const sendNow = req.body?.sendNow === true || req.body?.sendNow === 'true';
  const notification = await createNotification(req.body, req.user.id, { sendNow });

  return success(
    res,
    {
      notification: notification.toSafeObject
        ? notification.toSafeObject()
        : notification,
    },
    201
  );
});

/**
 * GET /notifications
 * Paginated notification history.
 */
export const list = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const { results, count } = await listNotifications({
    status: req.query.status,
    type: req.query.type,
    limit,
    offset,
  });

  return successPaginated(res, results, count, limit, offset, 200, req);
});

/**
 * GET /notifications/stats
 * Aggregate delivery stats.
 */
export const stats = asyncHandler(async (req, res) => {
  const data = await getNotificationStats();
  return success(res, data);
});

/**
 * GET /notifications/:id
 * Notification detail with delivery logs.
 */
export const getById = asyncHandler(async (req, res) => {
  const notification = await getNotificationDetail(req.params.id);
  return success(res, { notification });
});

/**
 * POST /notifications/:id/send
 * Manually trigger send for draft/scheduled notifications.
 */
export const send = asyncHandler(async (req, res) => {
  const notification = await sendNotification(req.params.id);
  return success(res, {
    notification: notification.toSafeObject
      ? notification.toSafeObject()
      : notification,
  });
});

/**
 * POST /notifications/:id/cancel
 * Cancel a scheduled/draft notification.
 */
export const cancel = asyncHandler(async (req, res) => {
  const notification = await cancelNotification(req.params.id);
  return success(res, {
    notification: notification.toSafeObject(),
  });
});

/**
 * DELETE /notifications/:id
 * Delete a draft or cancelled notification.
 */
export const remove = asyncHandler(async (req, res) => {
  const result = await deleteNotification(req.params.id);
  return success(res, result);
});
