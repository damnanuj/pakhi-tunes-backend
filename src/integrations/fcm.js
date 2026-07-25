import { getMessaging } from 'firebase-admin/messaging';
import { initFirebaseAdmin } from '../config/firebaseAdmin.js';

const FCM_BATCH_SIZE = 500;

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Ensure Firebase Admin is initialized, then return messaging instance.
 */
function getFcmMessaging() {
  initFirebaseAdmin();
  return getMessaging();
}

/**
 * Chunk an array into batches of `size`.
 */
function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Flatten actionPayload into string data fields for FCM data messages.
 * FCM data values must be strings.
 */
function flattenActionPayload(actionPayload = {}) {
  const data = {};
  if (!actionPayload || typeof actionPayload !== 'object') {
    return data;
  }

  for (const [key, value] of Object.entries(actionPayload)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object') {
      data[key] = JSON.stringify(value);
    } else {
      data[key] = String(value);
    }
  }

  return data;
}

/**
 * Build FCM multicast message from a Notification document/object.
 */
export function buildFcmPayload(notification) {
  const data = {
    notificationId: String(notification._id ?? notification.id ?? ''),
    type: String(notification.type ?? 'general'),
    actionType: String(notification.actionType ?? 'open_app'),
    ...flattenActionPayload(notification.actionPayload),
  };

  if (notification.imageUrl) {
    data.imageUrl = String(notification.imageUrl);
  }

  const message = {
    notification: {
      title: notification.title,
      body: notification.body,
    },
    data,
    android: {
      priority: notification.priority === 'high' ? 'high' : 'normal',
      notification: {
        sound: 'default',
        ...(notification.imageUrl ? { imageUrl: notification.imageUrl } : {}),
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          'mutable-content': 1,
          ...(notification.priority === 'high' ? { 'content-available': 1 } : {}),
        },
      },
      ...(notification.imageUrl
        ? { fcmOptions: { imageUrl: notification.imageUrl } }
        : {}),
    },
  };

  return message;
}

/**
 * Parse a multicast send response into success/failure/invalid token lists.
 */
export function handleSendResponse(response, tokens) {
  const failedTokens = [];
  const invalidTokens = [];
  let successCount = response.successCount ?? 0;
  let failureCount = response.failureCount ?? 0;

  const responses = response.responses ?? [];
  for (let i = 0; i < responses.length; i++) {
    const item = responses[i];
    if (item.success) continue;

    const token = tokens[i];
    const code = item.error?.code ?? '';

    if (token) {
      failedTokens.push(token);
      if (INVALID_TOKEN_CODES.has(code)) {
        invalidTokens.push(token);
      }
    }
  }

  return {
    successCount,
    failureCount,
    failedTokens,
    invalidTokens,
  };
}

/**
 * Send a notification to a list of FCM tokens in batches of 500.
 * Returns aggregate results across all batches.
 *
 * @param {string[]} tokens
 * @param {object} notification - Notification-like object
 * @returns {Promise<{
 *   totalTargets: number,
 *   successCount: number,
 *   failureCount: number,
 *   invalidTokens: string[],
 *   batches: Array<{
 *     batchIndex: number,
 *     totalInBatch: number,
 *     successCount: number,
 *     failureCount: number,
 *     failedTokens: string[],
 *     invalidTokens: string[],
 *     error: string|null,
 *     durationMs: number,
 *   }>
 * }>}
 */
export async function sendToDevices(tokens, notification) {
  const uniqueTokens = [...new Set((tokens ?? []).filter((t) => typeof t === 'string' && t.trim()))];
  const basePayload = buildFcmPayload(notification);
  const batches = chunkArray(uniqueTokens, FCM_BATCH_SIZE);
  const messaging = getFcmMessaging();

  const results = {
    totalTargets: uniqueTokens.length,
    successCount: 0,
    failureCount: 0,
    invalidTokens: [],
    batches: [],
  };

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batchTokens = batches[batchIndex];
    const startedAt = Date.now();

    try {
      const response = await messaging.sendEachForMulticast({
        tokens: batchTokens,
        ...basePayload,
      });

      const parsed = handleSendResponse(response, batchTokens);
      const durationMs = Date.now() - startedAt;

      results.successCount += parsed.successCount;
      results.failureCount += parsed.failureCount;
      results.invalidTokens.push(...parsed.invalidTokens);

      results.batches.push({
        batchIndex,
        totalInBatch: batchTokens.length,
        successCount: parsed.successCount,
        failureCount: parsed.failureCount,
        failedTokens: parsed.failedTokens,
        invalidTokens: parsed.invalidTokens,
        error: null,
        durationMs,
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = error?.message ?? 'FCM send failed';

      results.failureCount += batchTokens.length;
      results.batches.push({
        batchIndex,
        totalInBatch: batchTokens.length,
        successCount: 0,
        failureCount: batchTokens.length,
        failedTokens: batchTokens,
        invalidTokens: [],
        error: message,
        durationMs,
      });
    }
  }

  results.invalidTokens = [...new Set(results.invalidTokens)];
  return results;
}

/**
 * Retry sending to a specific list of failed tokens (single batch).
 */
export async function retrySendToTokens(tokens, notification) {
  const uniqueTokens = [...new Set((tokens ?? []).filter((t) => typeof t === 'string' && t.trim()))];
  if (uniqueTokens.length === 0) {
    return {
      successCount: 0,
      failureCount: 0,
      failedTokens: [],
      invalidTokens: [],
      durationMs: 0,
      error: null,
    };
  }

  const messaging = getFcmMessaging();
  const basePayload = buildFcmPayload(notification);
  const startedAt = Date.now();

  try {
    const response = await messaging.sendEachForMulticast({
      tokens: uniqueTokens.slice(0, FCM_BATCH_SIZE),
      ...basePayload,
    });

    const parsed = handleSendResponse(response, uniqueTokens);
    return {
      ...parsed,
      durationMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    return {
      successCount: 0,
      failureCount: uniqueTokens.length,
      failedTokens: uniqueTokens,
      invalidTokens: [],
      durationMs: Date.now() - startedAt,
      error: error?.message ?? 'FCM retry failed',
    };
  }
}

export { FCM_BATCH_SIZE, INVALID_TOKEN_CODES };
