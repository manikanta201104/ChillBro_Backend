import mongoose from 'mongoose';

const triggerLinkSchema = new mongoose.Schema (
  {
    triggerLinkId:{
      type:String,
      required:true,
      unique:true,
    },
    fromSource: {
      type: String,
      required: true,
      enum:['mood','screenTime','default'],
    },
    recommendationId: {
      type: String,
      required: true,
    },
    timestamp:{
      type:Date,
      reequired:true,
      default: Date.now,
    },
    note: {
      type: String,
      default: null,
    },
  },
  {timestamps: true}
);

triggerLinkSchema.index ({recommendationId: 1});

export default mongoose.model ('TriggerLink', triggerLinkSchema);
