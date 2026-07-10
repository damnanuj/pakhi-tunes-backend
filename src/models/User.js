import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: {
      type: String,
      select: false,
      required: function requiredPasswordHash() {
        return this.authProvider === 'password' || this.authProvider === 'both';
      },
    },
    avatar: { type: String, default: null },
    discoverable: { type: Boolean, default: false },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    isBanned: { type: Boolean, default: false },
    authProvider: {
      type: String,
      enum: ['password', 'google', 'both'],
      default: 'password',
      index: true,
    },
    googleUid: {
      type: String,
      default: null,
      trim: true,
      sparse: true,
      unique: true,
    },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function comparePassword(plainPassword) {
  if (!this.passwordHash) {
    return Promise.resolve(false);
  }
  return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.statics.hashPassword = async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, 12);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    avatar: this.avatar ?? null,
    discoverable: Boolean(this.discoverable),
    role: this.role ?? 'user',
    isAdmin: this.role === 'admin',
    isBanned: Boolean(this.isBanned),
    authProvider: this.authProvider ?? 'password',
    lastLoginAt: this.lastLoginAt ?? null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('User', userSchema);
