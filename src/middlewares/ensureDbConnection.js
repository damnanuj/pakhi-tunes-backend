import { connectDB } from '../config/db.js';

export const ensureDbConnection = async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('Database connection error:', error);
    return res.status(503).json({
      success: false,
      msg: 'Database connection failed. Please try again.',
    });
  }
};
