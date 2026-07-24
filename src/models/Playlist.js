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

const SONG_SORTS = {
  addedAt_desc: (a, b) => new Date(b.addedAt) - new Date(a.addedAt),
  addedAt_asc: (a, b) => new Date(a.addedAt) - new Date(b.addedAt),
  title_asc: (a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
  title_desc: (a, b) =>
    b.title.localeCompare(a.title, undefined, { sensitivity: 'base' }),
};

export const DEFAULT_SONG_SORT = 'addedAt_desc';

export function resolveSongSort(value) {
  return SONG_SORTS[value] ? value : DEFAULT_SONG_SORT;
}

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
    visibility: {
      type: String,
      enum: ['private', 'public'],
      default: 'private',
      index: true,
    },
    likesCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    songs: { type: [playlistSongSchema], default: [] },
  },
  { timestamps: true }
);

playlistSchema.index({ userId: 1, createdAt: -1 });

playlistSchema.methods.toSafeObject = function toSafeObject(options = {}) {
  const songs = [...(this.songs ?? [])];
  songs.sort(SONG_SORTS[resolveSongSort(options.songSort)]);

  return {
    id: this._id.toString(),
    name: this.name,
    coverUrl: this.coverUrl ?? '',
    visibility: this.visibility ?? 'private',
    likesCount: this.likesCount ?? 0,
    songCount: Array.isArray(this.songs) ? this.songs.length : 0,
    songs: songs.map((song) => ({
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
    visibility: this.visibility ?? 'private',
    likesCount: this.likesCount ?? 0,
    songCount: Array.isArray(this.songs) ? this.songs.length : 0,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('Playlist', playlistSchema);
