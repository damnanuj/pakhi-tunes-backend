import User from '../models/User.js';
import { success } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signToken } from '../utils/jwt.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    throw new AppError('Email is required', 400);
  }
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalized)) {
    throw new AppError('Invalid email format', 400);
  }
  return normalized;
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    throw new AppError('Password is required', 400);
  }
  if (password.length < 4) {
    throw new AppError('Password must be at least 4 characters', 400);
  }
  return password;
}

function validateName(name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new AppError('Name is required', 400);
  }
  return name.trim();
}

function issueAuthResponse(res, user, statusCode = 200) {
  const token = signToken({
    id: user._id.toString(),
    email: user.email,
    name: user.name,
  });
  success(res, { user: user.toSafeObject(), token }, statusCode);
}

export const register = asyncHandler(async (req, res) => {
  const name = validateName(req.body.name);
  const email = validateEmail(req.body.email);
  const password = validatePassword(req.body.password);

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError('Email is already registered', 409);
  }

  const passwordHash = await User.hashPassword(password);
  const user = await User.create({ name, email, passwordHash });
  issueAuthResponse(res, user, 201);
});

export const login = asyncHandler(async (req, res) => {
  const email = validateEmail(req.body.email);
  const password = validatePassword(req.body.password);

  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401);
  }

  issueAuthResponse(res, user);
});

export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  success(res, { user: user.toSafeObject() });
});
