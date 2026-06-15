import { AppError } from '../utils/AppError.js';

export const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ data: null, error: { message: err.message }, isSuccess: false });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ data: null, error: { message: err.message }, isSuccess: false });
  }
  if (err.code === 11000) {
    return res.status(409).json({ data: null, error: { message: 'Email is already registered' }, isSuccess: false });
  }
  console.error('[500]', err?.message ?? err);
  res.status(500).json({ data: null, error: { message: 'Internal server error' }, isSuccess: false });
};
