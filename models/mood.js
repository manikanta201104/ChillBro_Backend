import mongoose from 'mongoose';

const moodSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true }, // Unique identifier for a single document per user
    mood: {
      type: String,
      required: true,
      enum: ['happy', 'sad', 'angry', 'stressed', 'calm', 'neutral'],
    },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

// Index on userId for efficient lookup and uniqueness
moodSchema.index({ userId: 1 }, { unique: true });

export default mongoose.model('Mood', moodSchema);