import { loginRetryAfterSeconds } from '../services/loginLockoutService.js';

/**
 * Blocks a login attempt while its account or IP is locked.
 * Uses the same 429 envelope as the other limiters.
 */
export async function loginLockoutGate(req, res, next) {
  try {
    const email =
      typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const retryAfter = await loginRetryAfterSeconds(email, req.ip);

    if (retryAfter > 0) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        data: null,
        error: {
          message: 'Too many failed login attempts. Try again later.',
          code: 'RATE_LIMITED',
        },
        isSuccess: false,
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}
