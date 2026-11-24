import mongoose from 'mongoose';

const listeningDaySchema = new mongoose.Schema(
  {
    dayKey: { type: String, required: true, unique: true, trim: true },
    listenedMs: { type: Number, default: 0, min: 0 },
    playCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('ListeningDay', listeningDaySchema);
