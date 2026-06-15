import mongoose from 'mongoose';

const favoriteSchema = new mongoose.Schema(
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
    durationSec: { type: Number, default: 0 },
    uri: { type: String, default: '' },
  },
  { timestamps: true }
);

favoriteSchema.index({ userId: 1, songId: 1 }, { unique: true });

favoriteSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    songId: this.songId,
    encryptedId: this.encryptedId,
    title: this.title,
    artist: this.artist,
    artworkUrl: this.artworkUrl,
    durationSec: this.durationSec,
    uri: this.uri,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('Favorite', favoriteSchema);
