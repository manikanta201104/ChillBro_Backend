import mongoose from 'mongoose';

const tabsSchema = new mongoose.Schema(
  {
    url: String,
    timeSpent: Number,
  },
  { _id: false }
);

const screenTimeSchema = new mongoose.Schema(
  {
    screenTimeId: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: String,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    totalTime: {
      type: Number,
      required: true,
    },
    tabs: [tabsSchema],
  },
  { timestamps: true, versionKey: false } // Disable versioning to avoid VersionError
);

screenTimeSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model('ScreenTime', screenTimeSchema);