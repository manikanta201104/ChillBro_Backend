// import express from 'express';
// import { logger } from '../index.js';
// import Mood from '../models/mood.js';
// import { authMiddleware } from '../middleware/auth.js';

// const router = express.Router();

// // POST /test-mood
// router.post('/', authMiddleware, async (req, res) => {
//   const { mood, confidence } = req.body;
//   const userId = req.user.userId;

//   try {
//     const newMood = new Mood({
//       moodId: `mood_${Date.now()}`,
//       userId,
//       mood,
//       confidence,
//       timestamp: new Date(),
//     });

//     await newMood.save();
//     logger.info('Mood saved successfully', { userId, mood });
//     res.status(201).json({ message: 'Mood saved' });
//   } catch (error) {
//     logger.error('Error saving mood:', error);
//     throw error;
//   }
// });

// export default router;