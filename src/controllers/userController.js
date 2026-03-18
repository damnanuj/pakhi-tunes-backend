import User from '../models/User.js';
import { success, successPaginated } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const DEFAULT_LIMIT = 10;
const DEFAULT_OFFSET = 0;

export const getUsers = asyncHandler(async (req, res) => {
  const limit = Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || DEFAULT_OFFSET);

  const [users, count] = await Promise.all([
    User.find().skip(offset).limit(limit),
    User.countDocuments(),
  ]);

  successPaginated(res, users, count, limit, offset);
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  success(res, user);
});

export const createUser = asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  const user = await User.create({ name, email });
  success(res, user, 201);
});
