import mongoose from 'mongoose';

const appReviewSchema = new mongoose.Schema(
  {
    slug: { type: String, default: 'pakhi-tunes', trim: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 5000,
    },
  },
  { timestamps: true }
);

appReviewSchema.index({ slug: 1, createdAt: -1 });

appReviewSchema.methods.toPublicObject = function toPublicObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    rating: this.rating,
    text: this.text,
    createdAt: this.createdAt?.toISOString?.() ?? this.createdAt,
  };
};

export default mongoose.model('AppReview', appReviewSchema);
