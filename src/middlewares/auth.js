import { AppError } from '../utils/AppError.js';
import { verifyToken } from '../utils/jwt.js';

function userFromDecoded(decoded) {
  return {
    id: decoded.id,
    email: decoded.email,
    name: decoded.name,
    role: decoded.role ?? 'user',
  };
}

export const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  try {
    const token = header.slice(7);
    const decoded = verifyToken(token);
    req.user = userFromDecoded(decoded);
  } catch {
    req.user = null;
  }
  next();
};

export const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', 401));
  }

  try {
    const token = header.slice(7);
    const decoded = verifyToken(token);
    req.user = userFromDecoded(decoded);
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
};
