import User from "../models/User.js";
import { success } from "../utils/apiResponse.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { signToken } from "../utils/jwt.js";
import { convertGuestToUser } from "../services/guestService.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email) {
  if (!email || typeof email !== "string") {
    throw new AppError("Email is required", 400);
  }
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalized)) {
    throw new AppError("Invalid email format", 400);
  }
  return normalized;
}

function validatePassword(password) {
  if (!password || typeof password !== "string") {
    throw new AppError("Password is required", 400);
  }
  if (password.length < 4) {
    throw new AppError("Password must be at least 4 characters", 400);
  }
  return password;
}

function validateName(name) {
  if (!name || typeof name !== "string" || !name.trim()) {
    throw new AppError("Name is required", 400);
  }
  return name.trim();
}

function issueAuthResponse(res, user, statusCode = 200) {
  const token = signToken({
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role ?? "user",
  });
  success(res, { user: user.toSafeObject(), token }, statusCode);
}

async function handleGuestConversion(req, user) {
  const deviceId = req.body.deviceId ?? req.body.guestId;
  if (!deviceId) return;
  await convertGuestToUser(deviceId, user._id);
}

async function touchLastLogin(user) {
  user.lastLoginAt = new Date();
  await user.save();
}

export const register = asyncHandler(async (req, res) => {
  const name = validateName(req.body.name);
  const email = validateEmail(req.body.email);
  const password = validatePassword(req.body.password);

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.authProvider === "google") {
      throw new AppError(
        "This account uses Google sign-in. Please continue with Google.",
        409
      );
    }
    throw new AppError("Email is already registered", 409);
  }

  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    name,
    email,
    passwordHash,
    role: "user",
    authProvider: "password",
    lastLoginAt: new Date(),
  });
  await handleGuestConversion(req, user);
  issueAuthResponse(res, user, 201);
});

export const login = asyncHandler(async (req, res) => {
  const email = validateEmail(req.body.email);
  const password = validatePassword(req.body.password);

  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  if (user.authProvider === "google") {
    throw new AppError(
      "This account uses Google sign-in. Please continue with Google.",
      400
    );
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new AppError("Invalid email or password", 401);
  }

  if (user.isBanned) {
    throw new AppError("Account is suspended", 403);
  }

  await touchLastLogin(user);
  await handleGuestConversion(req, user);
  issueAuthResponse(res, user);
});

export const googleLogin = asyncHandler(async (req, res) => {
  const idToken = req.body.idToken;
  if (!idToken || typeof idToken !== "string" || !idToken.trim()) {
    throw new AppError("idToken is required", 400);
  }

  const { verifyFirebaseIdToken } = await import("../config/firebaseAdmin.js");
  const decoded = await verifyFirebaseIdToken(idToken);
  const googleUid = decoded.uid;
  const email = validateEmail(decoded.email);
  const name =
    typeof decoded.name === "string" && decoded.name.trim()
      ? decoded.name.trim()
      : email.split("@")[0];
  const avatar =
    typeof decoded.picture === "string" && decoded.picture.trim()
      ? decoded.picture.trim()
      : null;

  if (!googleUid) {
    throw new AppError("Invalid Google sign-in token", 401);
  }

  let user = await User.findOne({ email });

  if (user) {
    if (user.authProvider === "password") {
      if (decoded.email_verified !== true) {
        throw new AppError(
          "Google email is not verified. Please sign in with email and password.",
          403
        );
      }
      user.googleUid = googleUid;
      user.authProvider = "both";
      if (avatar && !user.avatar) {
        user.avatar = avatar;
      }
      await touchLastLogin(user);
      await handleGuestConversion(req, user);
      return issueAuthResponse(res, user);
    }

    if (user.isBanned) {
      throw new AppError("Account is suspended", 403);
    }

    if (!user.googleUid) {
      user.googleUid = googleUid;
    }
    if (avatar && !user.avatar) {
      user.avatar = avatar;
    }
    if (name && user.name !== name) {
      user.name = name;
    }
    await touchLastLogin(user);
    await handleGuestConversion(req, user);
    return issueAuthResponse(res, user);
  }

  user = await User.findOne({ googleUid });
  if (user) {
    if (user.isBanned) {
      throw new AppError("Account is suspended", 403);
    }
    await touchLastLogin(user);
    await handleGuestConversion(req, user);
    return issueAuthResponse(res, user);
  }

  user = await User.create({
    name,
    email,
    avatar,
    role: "user",
    authProvider: "google",
    googleUid,
    lastLoginAt: new Date(),
  });

  await handleGuestConversion(req, user);
  issueAuthResponse(res, user, 201);
});

export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    throw new AppError("User not found", 404);
  }
  success(res, { user: user.toSafeObject() });
});
