import mongoose from 'mongoose';

const appConfigSchema = new mongoose.Schema(
  {
    updateAvailable: { type: Boolean, default: false },
    forceUpdate: { type: Boolean, default: false },
    latestVersion: { type: String, default: '1.0.0' },
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
    releaseSections: {
      type: [
        {
          title: { type: String, trim: true, default: '' },
          items: [{ type: String, trim: true }],
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model('AppConfig', appConfigSchema);
