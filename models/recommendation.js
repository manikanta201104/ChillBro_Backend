import mongoose from 'mongoose';

const recommendationSchema = new mongoose.Schema(
  {
    recommendationId: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['break', 'message', 'music'], // Added 'music' to enum
    },
    details: {
      type: String,
      required: true,
    },
    trigger: {
      type: String,
      required: true,
    },
    accepted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Recommendation', recommendationSchema);