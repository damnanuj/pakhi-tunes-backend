import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { verifyToken } from '../utils/jwt.js';

/**
 * Shared rate limiting built on express-rate-limit.
 *
 * - Every limiter returns the same 429 envelope the rest of the API uses:
 *   { data: null, error: { message, code: 'RATE_LIMITED' }, isSuccess: false }
 * - Each limiter owns its own MemoryStore (express-rate-limit default), so
 *   counters never leak between limits.
 * - `methods` restricts a limiter to some HTTP verbs; other verbs pass through.
 * - Keys: authenticated user id when available, then device id from the body
 *   (presence / listening / guest ping), then client IP.
 */

const MINUTE = 60_000;
const FIFTEEN_MINUTES = 15 * MINUTE;
const FIVE_MINUTES = 5 * MINUTE;

// ---------- key generators ----------

function ipKey(req) {
  return `ip:${ipKeyGenerator(req.ip ?? '')}`;
}

function bearerUserId(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    return verifyToken(header.slice(7))?.id ?? null;
  } catch {
    return null;
  }
}

function userKey(req) {
  const id = req.user?.id ?? bearerUserId(req);
  return id ? `user:${id}` : ipKey(req);
}

function deviceKey(req) {
  const raw = req.body?.deviceId;
  const id = typeof raw === 'string' ? raw.trim().slice(0, 128) : '';
  return id ? `device:${id}` : ipKey(req);
}

function userOrDeviceKey(req) {
  const id = req.user?.id ?? bearerUserId(req);
  return id ? `user:${id}` : deviceKey(req);
}

// ---------- response ----------

function sendRateLimited(req, res, _next, options) {
  const resetTime = req.rateLimit?.resetTime;
  const msLeft = resetTime ? resetTime.getTime() - Date.now() : options.windowMs;
  const retryAfterSec = Math.max(1, Math.ceil(msLeft / 1000));

  res.setHeader('Retry-After', String(retryAfterSec));
  res.status(429).json({
    data: null,
    error: {
      message: `Too many requests. Please try again in ${retryAfterSec} seconds.`,
      code: 'RATE_LIMITED',
    },
    isSuccess: false,
  });
}

// ---------- factory ----------

/**
 * @param {object} opts
 * @param {number} opts.windowMs
 * @param {number} opts.limit
 * @param {(req) => string} opts.keyGenerator
 * @param {string[]} [opts.methods] HTTP verbs this limiter counts; others skip
 * @param {(req) => boolean} [opts.skip] extra skip predicate
 */
export function createLimiter({ windowMs, limit, keyGenerator, methods, skip }) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    handler: sendRateLimited,
    skip: (req) => {
      if (methods && !methods.includes(req.method)) return true;
      return skip ? skip(req) : false;
    },
  });
}

// ---------- named limiters ----------

const GLOBAL_SKIP_POST = new Set([
  '/presence/heartbeat',
  '/presence/end',
  '/listening/report',
]);

export const limiters = {
  // Safety net for every route, per IP. Telemetry and discovery polling have
  // their own limits below, so they are excluded here.
  global: rateLimit({
    windowMs: FIVE_MINUTES,
    limit: 600,
    keyGenerator: ipKey,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    handler: sendRateLimited,
    skip: (req) => {
      if (req.path === '/health') return true;
      if (req.method === 'POST' && GLOBAL_SKIP_POST.has(req.path)) return true;
      if (req.method === 'GET' && req.path === '/sessions/nearby') return true;
      return false;
    },
  }),

  // Login, register, google sign-in: brute-force protection.
  authCredentials: createLimiter({
    windowMs: FIFTEEN_MINUTES,
    limit: 10,
    keyGenerator: ipKey,
    methods: ['POST'],
  }),
  authMe: createLimiter({
    windowMs: MINUTE,
    limit: 60,
    keyGenerator: userKey,
    methods: ['GET'],
  }),

  // Logged-in user routes.
  userRead: createLimiter({
    windowMs: MINUTE,
    limit: 120,
    keyGenerator: userKey,
    methods: ['GET'],
  }),
  userWrite: createLimiter({
    windowMs: MINUTE,
    limit: 60,
    keyGenerator: userKey,
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  }),

  // Nearby discovery polls every ~2.5s on the app, so it gets its own ceiling.
  nearby: createLimiter({
    windowMs: MINUTE,
    limit: 40,
    keyGenerator: userKey,
    methods: ['GET'],
  }),
  sessionsRead: createLimiter({
    windowMs: MINUTE,
    limit: 120,
    keyGenerator: userKey,
    methods: ['GET'],
    skip: (req) => req.path === '/nearby',
  }),

  // Presence heartbeat and end. Real traffic is ~4/min per device.
  presenceTelemetry: createLimiter({
    windowMs: MINUTE,
    limit: 12,
    keyGenerator: deviceKey,
    methods: ['POST'],
  }),

  // Listening reports: once per finished track.
  listeningReport: createLimiter({
    windowMs: MINUTE,
    limit: 30,
    keyGenerator: userOrDeviceKey,
    methods: ['POST'],
  }),

  // Guest ping: once per foreground for guests.
  guestPing: createLimiter({
    windowMs: MINUTE,
    limit: 10,
    keyGenerator: deviceKey,
    methods: ['POST'],
  }),

  // Device token registration (anonymous or signed-in).
  anonDevices: createLimiter({
    windowMs: MINUTE,
    limit: 20,
    keyGenerator: ipKey,
    methods: ['POST', 'DELETE'],
  }),

  // Catalog reads hit scrapers and upstream sites, so keep them tighter.
  catalogRead: createLimiter({
    windowMs: MINUTE,
    limit: 120,
    keyGenerator: ipKey,
    methods: ['GET'],
  }),

  // Public read-only content.
  publicRead: createLimiter({
    windowMs: MINUTE,
    limit: 60,
    keyGenerator: ipKey,
    methods: ['GET'],
  }),
  // Public app details, downloads and reviews.
  appsPublic: createLimiter({
    windowMs: MINUTE,
    limit: 60,
    keyGenerator: ipKey,
  }),

  // Admin mutations on public routers (app config, app releases).
  adminWrite: createLimiter({
    windowMs: MINUTE,
    limit: 120,
    keyGenerator: userKey,
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  }),

  // Notification create / send / resend. Mounted in notificationRoutes.js.
  notificationSend: createLimiter({
    windowMs: MINUTE,
    limit: 10,
    keyGenerator: userKey,
    methods: ['POST'],
  }),
};

/**
 * Route-prefix -> limiter chain. app.js mounts each entry before its router,
 * so every endpoint under these prefixes is covered by at least one limiter.
 * Order matters: '/sessions/nearby' must come before '/sessions'.
 */
export const routeLimits = [
  ['/auth', [limiters.authCredentials, limiters.authMe]],
  ['/users', [limiters.userRead, limiters.userWrite]],
  ['/favorites', [limiters.userRead, limiters.userWrite]],
  ['/history', [limiters.userRead, limiters.userWrite]],
  ['/playlists', [limiters.userRead, limiters.userWrite]],
  ['/sessions/nearby', [limiters.nearby]],
  ['/sessions', [limiters.sessionsRead, limiters.userWrite]],
  ['/top-artists', [limiters.catalogRead]],
  ['/songs', [limiters.catalogRead]],
  ['/albums', [limiters.catalogRead]],
  ['/genres', [limiters.catalogRead]],
  ['/new-releases', [limiters.catalogRead]],
  ['/catalog-playlists', [limiters.catalogRead]],
  ['/app-config', [limiters.publicRead, limiters.adminWrite]],
  ['/app-releases', [limiters.publicRead, limiters.adminWrite]],
  ['/apps', [limiters.appsPublic]],
  ['/guests', [limiters.guestPing, limiters.userRead, limiters.userWrite]],
  ['/presence', [limiters.presenceTelemetry, limiters.userRead]],
  ['/listening', [limiters.listeningReport, limiters.userRead]],
  ['/devices', [limiters.anonDevices, limiters.userRead]],
  ['/notifications', [limiters.userRead, limiters.userWrite]],
];
