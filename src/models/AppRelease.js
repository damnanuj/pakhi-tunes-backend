import mongoose from 'mongoose';

const releaseSectionSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, default: '' },
    items: [{ type: String, trim: true }],
  },
  { _id: true }
);

const appReleaseSchema = new mongoose.Schema(
  {
    version: { type: String, required: true, trim: true, unique: true },
    downloadUrl: { type: String, default: '' },
    updateTitle: { type: String, default: 'Update Available' },
    updateMessage: {
      type: String,
      default:
        'A new version of Pakhi Tunes is available. Please update for the best experience.',
    },
    forceUpdateTitle: { type: String, default: 'Update Required' },
    forceUpdateMessage: {
      type: String,
      default:
        'This version of Pakhi Tunes is no longer supported. Please update to continue using the app.',
    },
    releaseSections: { type: [releaseSectionSchema], default: [] },
    updateAvailable: { type: Boolean, default: false },
    forceUpdate: { type: Boolean, default: false },
    releasedAt: { type: Date, default: Date.now },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

appReleaseSchema.index({ releasedAt: -1 });

export default mongoose.model('AppRelease', appReleaseSchema);
