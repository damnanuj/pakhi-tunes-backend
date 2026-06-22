import mongoose from 'mongoose';

const playHistorySchema = new mongoose.Schema(
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
    albumId: { type: String, default: '', trim: true },
    albumName: { type: String, default: '', trim: true },
    durationSec: { type: Number, default: 0 },
    language: { type: String, default: '', trim: true },
    playedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

playHistorySchema.index({ userId: 1, songId: 1 }, { unique: true });
playHistorySchema.index({ userId: 1, playedAt: -1 });

playHistorySchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    songId: this.songId,
    encryptedId: this.encryptedId,
    title: this.title,
    artist: this.artist,
    artworkUrl: this.artworkUrl,
    albumId: this.albumId,
    albumName: this.albumName,
    durationSec: this.durationSec,
    language: this.language,
    playedAt: this.playedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('PlayHistory', playHistorySchema);
