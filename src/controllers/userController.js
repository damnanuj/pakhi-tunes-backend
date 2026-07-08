import User from '../models/User.js';
import ActiveSession from '../models/ActiveSession.js';
import { success } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  success(res, user.toSafeObject());
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
