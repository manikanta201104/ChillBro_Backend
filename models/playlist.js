import mongoose from 'mongoose';

const playlistSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true,index:true },
    spotifyPlaylistId: { type: String, required: true,unique:true },
    name: { type: String, required: true },
    mood: {
      type: String,
      required: true,
    },
    timestamp: { type: Date, required: true, default: Date.now },
    saved: { type: Boolean, default: false },
  },
  { timestamps: true }
);


export default mongoose.model('Playlist', playlistSchema);