import mongoose from 'mongoose';

const appListingSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    tagline: { type: String, default: '', trim: true },
    imageUrl: { type: String, default: '', trim: true },
    screenshots: { type: [String], default: [] },
    description: { type: [String], default: [] },
    features: { type: [String], default: [] },
    category: { type: String, default: '', trim: true },
    availableOn: { type: [String], default: [] },
    downloadUrl: { type: String, default: '', trim: true },
    downloadCount: { type: Number, default: 0, min: 0 },
    updatedOn: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

appListingSchema.methods.toPublicObject = function toPublicObject() {
  return {
    slug: this.slug,
    name: this.name,
    tagline: this.tagline,
    imageUrl: this.imageUrl,
    screenshots: this.screenshots,
    description: this.description,
    features: this.features,
    category: this.category,
    availableOn: this.availableOn,
    downloadUrl: this.downloadUrl,
    downloadCount: this.downloadCount,
    updatedOn: this.updatedOn || undefined,
    updatedAt: this.updatedAt?.toISOString?.() ?? this.updatedAt,
  };
};

export default mongoose.model('AppListing', appListingSchema);
