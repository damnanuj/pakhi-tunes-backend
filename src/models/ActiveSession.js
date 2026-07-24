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
    visibility: {
      type: String,
      enum: ['nearby', 'private'],
      default: 'nearby',
    },
    roomCode: {
      type: String,
      default: undefined,
    },
    // Only set when coordinates exist — never leave { type: 'Point' } alone
    // or the 2dsphere index will crash the process.
    location: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number],
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
    doc.location = undefined;
    if (typeof doc.set === 'function') {
      doc.set('location', undefined);
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

activeSessionSchema.pre('save', function stripLocationOnSave(next) {
  stripInvalidLocation(this);
  next();
});

activeSessionSchema.pre('findOneAndUpdate', function stripLocationOnUpdate(next) {
  const update = this.getUpdate() ?? {};
  const $set = update.$set ?? update;

  if ($set.location && !hasValidCoordinates($set.location)) {
    delete $set.location;
    if (update.$set) {
      update.$unset = { ...(update.$unset ?? {}), location: 1 };
    } else {
      update.$unset = { ...(update.$unset ?? {}), location: 1 };
    }
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
    visibility: this.visibility ?? 'nearby',
    roomCode: this.roomCode ?? null,
    location: hasValidCoordinates(this.location) ? this.location : undefined,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('ActiveSession', activeSessionSchema);
