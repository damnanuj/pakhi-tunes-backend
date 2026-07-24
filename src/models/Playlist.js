import mongoose from 'mongoose';

const playlistSongSchema = new mongoose.Schema(
  {
    songId: { type: String, required: true, trim: true },
    encryptedId: { type: String, default: '', trim: true },
    title: { type: String, required: true, trim: true },
    artist: { type: String, required: true, trim: true },
    artworkUrl: { type: String, default: '' },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const playlistSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    coverUrl: { type: String, default: '', trim: true },
    songs: { type: [playlistSongSchema], default: [] },
  },
  { timestamps: true }
);

playlistSchema.index({ userId: 1, createdAt: -1 });

playlistSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    coverUrl: this.coverUrl ?? '',
    songCount: Array.isArray(this.songs) ? this.songs.length : 0,
    songs: (this.songs ?? []).map((song) => ({
      songId: song.songId,
      encryptedId: song.encryptedId ?? '',
      title: song.title,
      artist: song.artist,
      artworkUrl: song.artworkUrl ?? '',
      addedAt: song.addedAt?.toISOString?.() ?? song.addedAt,
    })),
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

playlistSchema.methods.toListObject = function toListObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    coverUrl: this.coverUrl ?? '',
    songCount: Array.isArray(this.songs) ? this.songs.length : 0,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('Playlist', playlistSchema);
