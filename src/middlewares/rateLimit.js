/**
 * Simple in-memory rate limiter for admin notification sends.
 * Limits to maxRequests per windowMs per user key.
 */
const buckets = new Map();

export function createRateLimiter({
  maxRequests = 10,
  windowMs = 60_000,
  keyFn = (req) => req.user?.id ?? req.ip,
  message = 'Too many requests. Please try again later.',
} = {}) {
  return (req, res, next) => {
    const key = String(keyFn(req) ?? 'anonymous');
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > maxRequests) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        data: null,
        error: { message },
        isSuccess: false,
      });
    }

    return next();
  };
}

// Periodic cleanup to avoid unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
    }
  }
}, 5 * 60_000).unref?.();
