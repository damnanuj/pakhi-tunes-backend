import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { verifyToken } from '../utils/jwt.js';
import { SlidingWindowStore } from './slidingWindowStore.js';

/**
 * Shared rate limiting built on express-rate-limit.
 *
 * - Every limiter returns the same 429 envelope the rest of the API uses:
 *   { data: null, error: { message, code: 'RATE_LIMITED' }, isSuccess: false }
 * - Each limiter owns its own SlidingWindowStore, so counters never leak
 *   between limits and there is no fixed-window boundary burst.
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

// Device token registration carries the app installation id in the body, which
// is a better key than a carrier IP shared by many phones.
function installationKey(req) {
  const raw = req.body?.installationId;
  const id = typeof raw === 'string' ? raw.trim().slice(0, 128) : '';
  return id ? `install:${id}` : ipKey(req);
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
    store: new SlidingWindowStore(),
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
  // Backstop for every route, per IP, meant to stop scrapers and floods, not
  // to shape normal use. One busy user peaks around 300 requests per 5 minutes,
  // and mobile carriers put many users behind one IP, so this allows about five
  // heavy users at once. The per-user and per-device limits below do the fine
  // work. Telemetry and discovery polling are excluded here.
  global: rateLimit({
    windowMs: FIVE_MINUTES,
    limit: 1500,
    keyGenerator: ipKey,
    store: new SlidingWindowStore(),
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
  // Register and Google sign-in. Password login uses loginLockoutGate instead.
  authCredentials: createLimiter({
    windowMs: FIFTEEN_MINUTES,
    limit: 10,
    keyGenerator: ipKey,
    methods: ['POST'],
    skip: (req) => req.path === '/login',
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

  // Nearby discovery polls every 2.5s on the app (~24/min), so 60/min leaves
  // 2.5x headroom for manual refreshes and screen re-entries.
  nearby: createLimiter({
    windowMs: MINUTE,
    limit: 60,
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
  // The host sends a position update every 3s (~20/min). It has its own
  // bucket so that steady telemetry never eats the budget for normal writes.
  sessionPosition: createLimiter({
    windowMs: MINUTE,
    limit: 60,
    keyGenerator: userKey,
    methods: ['PATCH'],
    skip: (req) => !/^\/[^/]+\/position$/.test(req.path),
  }),
  sessionsWrite: createLimiter({
    windowMs: MINUTE,
    limit: 60,
    keyGenerator: userKey,
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
    skip: (req) => /^\/[^/]+\/position$/.test(req.path),
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

  // Device token registration (anonymous or signed-in). The app registers once
  // at launch and when the push token rotates, so 10/min per installation is
  // generous. Keyed by installation so a shared carrier IP does not collide.
  anonDevices: createLimiter({
    windowMs: MINUTE,
    limit: 10,
    keyGenerator: installationKey,
    methods: ['POST', 'DELETE'],
  }),

  // Catalog reads hit scrapers and upstream sites, so keep them tighter.
  // Keyed by logged-in user when a valid token is sent, otherwise by IP, so a
  // user on a shared mobile-carrier IP does not drain everyone else's budget.
  // The global per-IP cap above still applies as a backstop.
  catalogRead: createLimiter({
    windowMs: MINUTE,
    limit: 120,
    keyGenerator: userKey,
    methods: ['GET'],
  }),
  // Short burst cap on top of the per-minute limit. The home screen sends
  // about five catalog calls at once, so 20 per 5 seconds leaves headroom.
  catalogBurst: createLimiter({
    windowMs: 5_000,
    limit: 20,
    keyGenerator: userKey,
    methods: ['GET'],
  }),

  // Public read-only content.
  publicRead: createLimiter({
    windowMs: MINUTE,
    limit: 60,
    keyGenerator: ipKey,
    methods: ['GET'],
  }),
  // Public app details (read only).
  appsRead: createLimiter({
    windowMs: MINUTE,
    limit: 60,
    keyGenerator: ipKey,
    methods: ['GET'],
  }),
  // Public writes are spam and counter-inflation targets, and a real person
  // does each of these about once, so the limits are far lower than for reads.
  appReviewCreate: createLimiter({
    windowMs: FIFTEEN_MINUTES,
    limit: 5,
    keyGenerator: ipKey,
    methods: ['POST'],
    skip: (req) => !/\/reviews$/.test(req.path),
  }),
  appDownloadCount: createLimiter({
    windowMs: 10 * MINUTE,
    limit: 10,
    keyGenerator: ipKey,
    methods: ['POST'],
    skip: (req) => !/\/downloads$/.test(req.path),
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
  ['/sessions', [limiters.sessionsRead, limiters.sessionPosition, limiters.sessionsWrite]],
  ['/top-artists', [limiters.catalogBurst, limiters.catalogRead]],
  ['/songs', [limiters.catalogBurst, limiters.catalogRead]],
  ['/albums', [limiters.catalogBurst, limiters.catalogRead]],
  ['/genres', [limiters.catalogBurst, limiters.catalogRead]],
  ['/new-releases', [limiters.catalogBurst, limiters.catalogRead]],
  ['/catalog-playlists', [limiters.catalogBurst, limiters.catalogRead]],
  ['/app-config', [limiters.publicRead, limiters.adminWrite]],
  ['/app-releases', [limiters.publicRead, limiters.adminWrite]],
  ['/apps', [limiters.appsRead, limiters.appReviewCreate, limiters.appDownloadCount]],
  ['/guests', [limiters.guestPing, limiters.userRead, limiters.userWrite]],
  ['/presence', [limiters.presenceTelemetry]],
  ['/listening', [limiters.listeningReport, limiters.userRead]],
  ['/dashboard', [limiters.userRead]],
  ['/devices', [limiters.anonDevices, limiters.userRead]],
  ['/notifications', [limiters.userRead, limiters.userWrite]],
];
