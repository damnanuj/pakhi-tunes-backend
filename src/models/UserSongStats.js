import mongoose from 'mongoose';

const userSongStatsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    songId: { type: String, required: true, trim: true },
    encryptedId: { type: String, default: '', trim: true },
    title: { type: String, required: true, trim: true },
    artist: { type: String, required: true, trim: true },
    artworkUrl: { type: String, default: '' },
    albumName: { type: String, default: '', trim: true },
    durationSec: { type: Number, default: 0, min: 0 },
    totalListenedMs: { type: Number, default: 0, min: 0 },
    playCount: { type: Number, default: 0, min: 0 },
    lastPlayedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

userSongStatsSchema.index({ userId: 1, songId: 1 }, { unique: true });
userSongStatsSchema.index({ userId: 1, totalListenedMs: -1 });
userSongStatsSchema.index({ songId: 1, totalListenedMs: -1 });

userSongStatsSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    userId: this.userId?.toString?.() ?? null,
    songId: this.songId,
    encryptedId: this.encryptedId ?? '',
    title: this.title,
    artist: this.artist,
    artworkUrl: this.artworkUrl ?? '',
    albumName: this.albumName ?? '',
    durationSec: this.durationSec ?? 0,
    totalListenedMs: this.totalListenedMs ?? 0,
    playCount: this.playCount ?? 0,
    lastPlayedAt: this.lastPlayedAt?.toISOString?.() ?? this.lastPlayedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('UserSongStats', userSongStatsSchema);
