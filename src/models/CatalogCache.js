import mongoose from 'mongoose';

const catalogCacheSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

catalogCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('CatalogCache', catalogCacheSchema);
