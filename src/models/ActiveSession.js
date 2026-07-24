import mongoose from 'mongoose';

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
    trackId: { type: String, required: true },
    trackTitle: { type: String },
    trackArtist: { type: String },
    trackArtwork: { type: String },
    trackUri: { type: String },
    trackDuration: { type: Number, default: 0 },
    playing: { type: Boolean, default: true },
    positionMs: { type: Number, default: 0 },
    listenerCount: { type: Number, default: 0 },
    visibility: {
      type: String,
      enum: ['nearby', 'private'],
      default: 'nearby',
    },
    roomCode: {
      type: String,
      default: undefined,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: false,
      },
    },
  },
  { timestamps: true }
);

activeSessionSchema.index({ location: '2dsphere' }, { sparse: true });
activeSessionSchema.index({ roomCode: 1 }, { unique: true, sparse: true });
activeSessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 3600 });

activeSessionSchema.methods.toPublicObject = function toPublicObject() {
  return {
    id: this._id.toString(),
    hostId: this.hostId.toString(),
    hostName: this.hostName ?? 'Listener',
    hostAvatar: this.hostAvatar ?? null,
    trackId: this.trackId,
    trackTitle: this.trackTitle ?? '',
    trackArtist: this.trackArtist ?? '',
    trackArtwork: this.trackArtwork ?? '',
    trackUri: this.trackUri ?? '',
    trackDuration: this.trackDuration ?? 0,
    playing: this.playing,
    positionMs: this.positionMs,
    listenerCount: this.listenerCount,
    visibility: this.visibility ?? 'nearby',
    roomCode: this.roomCode ?? null,
    location: this.location,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('ActiveSession', activeSessionSchema);
