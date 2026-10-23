import { AppError } from '../utils/AppError.js';

export const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ data: null, error: { message: err.message }, isSuccess: false });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ data: null, error: { message: err.message }, isSuccess: false });
  }
  if (err.code === 11000) {
    const duplicateField = Object.keys(err.keyPattern ?? err.keyValue ?? {})[0];
    const message =
      !duplicateField || duplicateField === 'email'
        ? 'Email is already registered'
        : 'Account could not be created';
    if (duplicateField && duplicateField !== 'email') {
      console.error('[409] duplicate key', err.keyValue ?? err.keyPattern);
    }
    return res.status(409).json({ data: null, error: { message }, isSuccess: false });
  }
  console.error('[500]', err?.message ?? err);
  res.status(500).json({ data: null, error: { message: 'Internal server error' }, isSuccess: false });
};
