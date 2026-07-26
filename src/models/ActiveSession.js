import mongoose from 'mongoose';

const sessionListenerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: { type: String, trim: true, default: 'Listener' },
    avatar: { type: String, default: null },
  },
  { _id: false }
);

const sessionQueueDownloadUrlSchema = new mongoose.Schema(
  {
    quality: { type: String, trim: true, default: '' },
    url: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const sessionQueueAddedBySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: { type: String, trim: true, default: 'Listener' },
    avatar: { type: String, default: null },
  },
  { _id: false }
);

const sessionQueueItemSchema = new mongoose.Schema(
  {
    songId: { type: String, required: true, trim: true },
    encryptedId: { type: String, default: '', trim: true },
    title: { type: String, required: true, trim: true },
    artist: { type: String, required: true, trim: true },
    artworkUrl: { type: String, default: '', trim: true },
    durationSec: { type: Number, default: 0 },
    albumName: { type: String, default: '', trim: true },
    downloadUrl: { type: [sessionQueueDownloadUrlSchema], default: [] },
    addedBy: { type: sessionQueueAddedBySchema, required: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const activeSessionSchema = new mongoose.Schema(
  {
    hostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    hostName: { type: String, trim: true },
    hostAvatar: { type: String, default: null },
    trackId: { type: String, default: '' },
    trackTitle: { type: String, default: '' },
    trackArtist: { type: String, default: '' },
    trackArtwork: { type: String, default: '' },
    trackUri: { type: String, default: '' },
    trackDuration: { type: Number, default: 0 },
    playing: { type: Boolean, default: false },
    positionMs: { type: Number, default: 0 },
    listenerCount: { type: Number, default: 0 },
    listeners: { type: [sessionListenerSchema], default: [] },
    queue: { type: [sessionQueueItemSchema], default: [] },
    visibility: {
      type: String,
      enum: ['nearby', 'private'],
      default: 'nearby',
    },
    roomCode: {
      type: String,
      default: undefined,
    },
    // Optional GeoJSON point. Never leave { type: 'Point' } without coordinates —
    // mongoose will fail validation and an uncaught save kills the Node process.
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: false,
      },
      coordinates: {
        type: [Number],
        required: false,
      },
    },
  },
  { timestamps: true }
);

function hasValidCoordinates(location) {
  return (
    location &&
    Array.isArray(location.coordinates) &&
    location.coordinates.length >= 2 &&
    Number.isFinite(location.coordinates[0]) &&
    Number.isFinite(location.coordinates[1])
  );
}

function stripInvalidLocation(doc) {
  if (!doc) return;
  if (!hasValidCoordinates(doc.location)) {
    // Clear before validation — setting undefined alone can leave a partial
    // { type: 'Point' } subdoc that still fails coordinates required checks.
    if (typeof doc.set === 'function') {
      doc.set('location', undefined);
    } else {
      doc.location = undefined;
    }
    if (typeof doc.markModified === 'function') {
      doc.markModified('location');
    }
  }
}

function mapListeners(listeners) {
  if (!Array.isArray(listeners)) return [];
  return listeners.map((listener) => ({
    userId: listener.userId?.toString?.() ?? String(listener.userId),
    name: listener.name ?? 'Listener',
    avatar: listener.avatar ?? null,
  }));
}

function mapQueue(queue) {
  if (!Array.isArray(queue)) return [];
  return queue.map((item) => ({
    queueItemId: item._id?.toString?.() ?? String(item._id ?? ''),
    songId: item.songId ?? '',
    encryptedId: item.encryptedId ?? '',
    title: item.title ?? '',
    artist: item.artist ?? '',
    artworkUrl: item.artworkUrl ?? '',
    durationSec: Number(item.durationSec) || 0,
    albumName: item.albumName ?? '',
    downloadUrl: Array.isArray(item.downloadUrl)
      ? item.downloadUrl.map((entry) => ({
          quality: entry.quality ?? '',
          url: entry.url ?? '',
        }))
      : [],
    addedBy: {
      userId:
        item.addedBy?.userId?.toString?.() ?? String(item.addedBy?.userId ?? ''),
      name: item.addedBy?.name ?? 'Listener',
      avatar: item.addedBy?.avatar ?? null,
    },
    addedAt:
      item.addedAt?.toISOString?.() ??
      (item.addedAt ? String(item.addedAt) : new Date().toISOString()),
  }));
}

// Must run on validate (not only save) — mongoose validates before pre('save').
activeSessionSchema.pre('validate', function stripLocationOnValidate(next) {
  stripInvalidLocation(this);
  next();
});

activeSessionSchema.pre('save', function stripLocationOnSave(next) {
  stripInvalidLocation(this);
  next();
});

activeSessionSchema.pre('findOneAndUpdate', function stripLocationOnUpdate(next) {
  const update = this.getUpdate() ?? {};
  const $set = update.$set ?? update;

  if ($set.location && !hasValidCoordinates($set.location)) {
    delete $set.location;
    update.$unset = { ...(update.$unset ?? {}), location: 1 };
  }

  this.setUpdate(update);
  next();
});

activeSessionSchema.index({ location: '2dsphere' }, { sparse: true });
activeSessionSchema.index({ roomCode: 1 }, { unique: true, sparse: true });
activeSessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 3600 });

activeSessionSchema.methods.toPublicObject = function toPublicObject() {
  return {
    id: this._id.toString(),
    hostId: this.hostId.toString(),
    hostName: this.hostName ?? 'Listener',
    hostAvatar: this.hostAvatar ?? null,
    trackId: this.trackId ?? '',
    trackTitle: this.trackTitle ?? '',
    trackArtist: this.trackArtist ?? '',
    trackArtwork: this.trackArtwork ?? '',
    trackUri: this.trackUri ?? '',
    trackDuration: this.trackDuration ?? 0,
    playing: this.playing,
    positionMs: this.positionMs,
    listenerCount: this.listenerCount,
    listeners: mapListeners(this.listeners),
    queue: mapQueue(this.queue),
    visibility: this.visibility ?? 'nearby',
    roomCode: this.roomCode ?? null,
    location: hasValidCoordinates(this.location) ? this.location : undefined,
    updatedAt: this.updatedAt,
  };
};

export { mapQueue };

export default mongoose.model('ActiveSession', activeSessionSchema);
