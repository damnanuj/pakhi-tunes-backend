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
    streamQuality: {
      type: String,
      enum: ['96kbps', '160kbps', '320kbps'],
      default: '320kbps',
    },
    downloadQuality: {
      type: String,
      enum: ['96kbps', '160kbps', '320kbps', null],
      default: null,
    },
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
      trim: true,
      sparse: true,
      unique: true,
    },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index({ createdAt: 1 });

userSchema.methods.comparePassword = function comparePassword(plainPassword) {
  if (!this.passwordHash) {
    return Promise.resolve(false);
  }
  return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.statics.hashPassword = async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, 12);
};

userSchema.statics.repairGoogleUidIndex = async function repairGoogleUidIndex() {
  await this.updateMany({ googleUid: null }, { $unset: { googleUid: 1 } });

  const indexes = await this.collection.indexes();
  const googleIndex = indexes.find((index) => index.key?.googleUid === 1);
  if (!googleIndex || googleIndex.sparse === true) return;

  await this.collection.dropIndex(googleIndex.name);
  await this.collection.createIndex(
    { googleUid: 1 },
    { unique: true, sparse: true, name: 'googleUid_1' }
  );
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    avatar: this.avatar ?? null,
    discoverable: Boolean(this.discoverable),
    streamQuality: this.streamQuality ?? '320kbps',
    downloadQuality: this.downloadQuality ?? null,
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
