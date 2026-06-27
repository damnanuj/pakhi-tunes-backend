import User from '../models/User.js';
import ActiveSession from '../models/ActiveSession.js';
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

  successPaginated(res, users, count, limit, offset, 200, req);
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  success(res, user);
});

export const createUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!password) throw new AppError('Password is required', 400);
  const passwordHash = await User.hashPassword(password);
  const user = await User.create({ name, email, passwordHash });
  success(res, user.toSafeObject(), 201);
});

export const updateDiscoverable = asyncHandler(async (req, res) => {
  const { discoverable } = req.body;
  if (typeof discoverable !== 'boolean') {
    throw new AppError('discoverable must be a boolean', 400);
  }

  const user = await User.findById(req.user.id);
  if (!user) throw new AppError('User not found', 404);

  user.discoverable = discoverable;
  await user.save();

  if (!discoverable) {
    await ActiveSession.deleteOne({ hostId: user._id });
  }

  success(res, { user: user.toSafeObject() });
});
