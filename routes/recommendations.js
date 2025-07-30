import express from 'express';
import { logger } from '../index.js';
import ScreenTime from '../models/screenTime.js';
import Mood from '../models/mood.js';
import Recommendation from '../models/recommendation.js';
import TriggerLink from '../models/triggerLink.js';
import { authMiddleware } from '../middleware/auth.js';
import axios from 'axios';

const router = express.Router();

// POST /recommendations
router.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.userId;

  try {
    // Fetch latest ScreenTime data for the current day
    const today = new Date().toISOString().split('T')[0];
    let latestScreenTime = await ScreenTime.findOne({ userId, date: today });

    // If no document exists, upsert a new one
    if (!latestScreenTime) {
      latestScreenTime = await ScreenTime.findOneAndUpdate(
        { userId, date: today },
        { userId, date: today, totalTime: 0, tabs: [] },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    // Fetch latest Mood data
    const latestMood = await Mood.findOne({ userId }).sort({ timestamp: -1 }).limit(1);

    // Default recommendation
    let recommendation = {
      type: 'message',
      details: { message: 'Keep up the good work!' },
      trigger: { message: 'No specific conditions met' },
      triggerSource: 'default',
      triggerNote: 'Default recommendation',
    };

    // Apply recommendation rules
    if (latestScreenTime && latestMood) {
      const totalTime = latestScreenTime.totalTime / 60; // Convert to minutes
      const mood = latestMood.mood.toLowerCase();
      console.log('Evaluating recommendation with:', { totalTime, mood, timestamp: latestMood.timestamp, rawTotalTime: latestScreenTime.totalTime });

      // Check most specific conditions first
      if (totalTime > 300 && mood === 'stressed') {
        try {
          const playlistResponse = await axios.get(`${process.env.BACKEND_URL}/spotify/playlist?mood=calm`, {
            headers: { Authorization: req.headers.authorization },
          });
          const { spotifyPlaylistId, name } = playlistResponse.data;
          recommendation = {
            type: 'music',
            details: {
              playlistId: spotifyPlaylistId,
              name,
            },
            trigger: { screenTime: '>5h', mood: 'stressed' },
            triggerSource: 'mood',
            triggerNote: 'Music suggested for stress',
          };
          console.log('Music recommendation triggered:', { playlistId: spotifyPlaylistId, name });
        } catch (spotifyError) {
          console.error('Spotify API error:', spotifyError.message);
          recommendation.triggerNote += ` (Spotify API failed: ${spotifyError.message})`;
        }
      } else if (totalTime > 180 && mood === 'tired') {
        try {
          const playlistResponse = await axios.get(`${process.env.BACKEND_URL}/spotify/playlist?mood=tired`, {
            headers: { Authorization: req.headers.authorization },
          });
          const { spotifyPlaylistId, name } = playlistResponse.data;
          recommendation = {
            type: 'music',
            details: {
              playlistId: spotifyPlaylistId,
              name,
            },
            trigger: { screenTime: '>3h', mood: 'tired' },
            triggerSource: 'mood',
            triggerNote: 'Music suggested for tiredness',
          };
        } catch (spotifyError) {
          console.error('Spotify API error:', spotifyError.message);
          recommendation.triggerNote += ` (Spotify API failed: ${spotifyError.message})`;
        }
      } else if (mood === 'happy') {
        recommendation = {
          type: 'message',
          details: { message: 'You’re doing great!' },
          trigger: { mood: 'happy' },
          triggerSource: 'mood',
          triggerNote: 'Triggered by positive mood',
        };
      } else {
        console.log('No matching condition met:', { totalTime, mood });
      }
    } else {
      console.log('Missing latestScreenTime or latestMood:', { latestScreenTime, latestMood });
    }

    // Save recommendation to database
    const newRecommendation = new Recommendation({
      recommendationId: `rec_${Date.now()}`,
      userId,
      timestamp: new Date(),
      type: recommendation.type,
      details: JSON.stringify(recommendation.details),
      trigger: JSON.stringify(recommendation.trigger),
      accepted: false,
    });

    await newRecommendation.save();
    logger.info('Recommendation saved', { userId, recommendation: newRecommendation });

    // Create TriggerLink
    const newTriggerLink = new TriggerLink({
      triggerLinkId: `tl_${Date.now()}`,
      fromSource: recommendation.triggerSource,
      recommendationId: newRecommendation.recommendationId,
      timestamp: new Date(),
      note: recommendation.triggerNote,
    });

    await newTriggerLink.save();
    logger.info('TriggerLink created', { userId, triggerLink: newTriggerLink });

    // Return recommendation
    res.status(200).json({
      type: recommendation.type,
      details: recommendation.details,
    });
  } catch (error) {
    logger.error('Error generating recommendation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /recommendations
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.userId;

  try {
    const recommendations = await Recommendation.find({ userId })
      .sort({ timestamp: -1 })
      .limit(5);

    logger.info('Recommendations fetched', { userId, count: recommendations.length });
    res.status(200).json(recommendations);
  } catch (error) {
    logger.error('Error fetching recommendations:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /recommendations/:id
router.patch('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const recommendationId = req.params.id;
  const { accepted } = req.body;

  try {
    if (typeof accepted !== 'boolean') {
      return res.status(400).json({ message: 'Accepted field must be a boolean' });
    }

    const updatedRecommendation = await Recommendation.findOneAndUpdate(
      { recommendationId, userId },
      { accepted },
      { new: true }
    );

    if (!updatedRecommendation) {
      return res.status(404).json({ message: 'Recommendation not found or not authorized' });
    }

    logger.info('Recommendation updated', { userId, recommendationId, accepted });
    res.status(200).json(updatedRecommendation);
  } catch (error) {
    logger.error('Error updating recommendation:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;