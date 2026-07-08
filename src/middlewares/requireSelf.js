import { AppError } from '../utils/AppError.js';

export const requireSelf = (req, res, next) => {
  if (req.params.id !== req.user.id) {
    return next(new AppError('Forbidden', 403));
  }
  next();
};
