import express from 'express';
import ScreenTime from '../models/screenTime.js';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../index.js';
import Challenge from '../models/challenge.js';
import User from '../models/user.js';
import mongoose from 'mongoose';

const router = express.Router();

router.post('/', authMiddleware, async (req, res) => {
  const { title, description, duration, goal, startDate } = req.body;

  try {
    if (!title || !duration || !goal || !startDate) {
      return res.status(400).json({
        message: 'Title, duration, goal, and startDate are required',
      });
    }

    const parsedStartDate = new Date(startDate);
    if (isNaN(parsedStartDate.getTime())) {
      return res.status(400).json({ message: 'Invalid startDate format' });
    }

    const challenge = new Challenge({
      challengeId: `challenge_${Date.now()}`,
      title,
      description: description || '',
      duration,
      goal,
      startDate: parsedStartDate,
    });

    await challenge.save();
    logger.info('Challenge created', {
      challengeId: challenge.challengeId,
      title,
    });
    res.status(201).json(challenge);
  } catch (err) {
    logger.error('Error creating challenge', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const challenges = await Challenge.find({
      $or: [
        { startDate: { $lte: now } },
        {
          startDate: {
            $gt: now,
            $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      ],
      $expr: {
        $gte: [
          {
            $add: [
              '$startDate',
              { $multiply: ['$duration', 24 * 60 * 60 * 1000] },
            ],
          },
          new Date(now.toDateString()),
        ],
      },
    }).sort({ startDate: 1 });

    logger.info('Challenges fetched', { count: challenges.length });
    res.status(200).json(challenges);
  } catch (err) {
    logger.error('Error fetching challenges', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.post('/join', authMiddleware, async (req, res) => {
  const { challengeId } = req.body;
  const userId = req.user.userId;

  try {
    if (!challengeId) {
      return res.status(400).json({ message: 'challengeId is required' });
    }

    const challenge = await Challenge.findOne({ challengeId });
    if (!challenge) {
      return res.status(404).json({ message: 'Challenge not found' });
    }

    logger.info('Checking join status', { challengeId, userId, participants: challenge.participants.map(p => p.userId) });
    const alreadyJoined = challenge.participants.some(p => p.userId === userId);
    if (alreadyJoined) {
      return res.status(400).json({ message: 'User already joined this challenge' });
    }

    challenge.participants.push({ userId, reduction: 0, lastUpdate: Date.now() });
    await challenge.save();

    logger.info('User joined challenge', { challengeId, userId });
    res.status(200).json({ message: 'Successfully joined challenge', challenge });
  } catch (err) {
    logger.error('Error joining challenge', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.post('/progress', authMiddleware, async (req, res) => {
  const { challengeId, manualTrigger = false } = req.body;
  const userId = req.user.userId;

  try {
    if (!challengeId) {
      return res.status(400).json({ message: 'challengeId is required' });
    }

    const challenge = await Challenge.findOne({ challengeId });
    if (!challenge) {
      return res.status(404).json({ message: 'Challenge not found' });
    }

    const participant = challenge.participants.find(p => p.userId === userId);
    if (!participant) {
      return res.status(403).json({ message: 'User not participating in this challenge' });
    }

    const now = new Date();
    const startDate = challenge.startDate;
    const endDate = new Date(
      startDate.getTime() + challenge.duration * 24 * 60 * 60 * 1000
    );

    if (now < startDate || now > endDate) {
      return res.status(400).json({ message: 'Challenge is not active' });
    }

    const baselineStart = new Date(
      startDate.getTime() - 7 * 24 * 60 * 60 * 1000
    );
    const baselineEnd = new Date(
      startDate.getTime() - 1 * 24 * 60 * 60 * 1000
    );
    const startOfBaselineStart = new Date(
      Date.UTC(
        baselineStart.getUTCFullYear(),
        baselineStart.getUTCMonth(),
        baselineStart.getUTCDate()
      )
    );
    const startOfBaselineEnd = new Date(
      Date.UTC(
        baselineEnd.getUTCFullYear(),
        baselineEnd.getUTCMonth(),
        baselineEnd.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );

    const baselineData = await ScreenTime.aggregate([
      {
        $match: {
          userId,
          date: { $gte: startOfBaselineStart, $lte: startOfBaselineEnd },
        },
      },
      {
        $group: {
          _id: null,
          avgTotalTime: { $avg: '$totalTime' },
          count: { $sum: 1 },
        },
      },
    ]);

    let baselineTotalTime;
    if (!baselineData.length || baselineData[0].count < 7) {
      logger.info('Insufficient baseline data, using first day as baseline', { userId });
      const firstDayData = await ScreenTime.findOne({ userId, date: { $gte: startDate } })
        .sort({ date: 1 });
      baselineTotalTime = firstDayData ? firstDayData.totalTime : 0;
      if (!firstDayData) {
        logger.warn('No data on first day, setting baseline to 0', { userId });
        return res.status(400).json({ message: 'No screen time data available for baseline' });
      }
    } else {
      baselineTotalTime = baselineData[0].avgTotalTime;
    }

    const currentDay = new Date(now.toISOString().split('T')[0]);
    let currentData = await ScreenTime.findOne({ userId, date: currentDay });
    if (!currentData) {
      currentData = await ScreenTime.findOne({
        userId,
        date: { $lt: currentDay },
      }).sort({ date: -1 });
    }

    const currentTotalTime = currentData
      ? currentData.totalTime
      : baselineTotalTime;

    const dailyReduction = Math.min(
      challenge.goal / 60,
      Math.max(0, (baselineTotalTime - currentTotalTime) / 3600)
    );
    const totalReduction = participant.reduction / 3600 + dailyReduction;
    const maxReduction = challenge.goal / 60 * challenge.duration;
    const newReduction = Math.min(totalReduction, maxReduction) * 3600;

    if (now - participant.lastUpdate >= 3600000 || manualTrigger) {
      participant.reduction = newReduction;
      participant.lastUpdate = now;
      await challenge.save();
      logger.info('Progress updated', { challengeId, userId, reduction: participant.reduction / 3600, timestamp: now });
      res.status(200).json({
        message: 'Progress updated',
        reduction: participant.reduction / 3600,
      });
    } else {
      logger.info('Progress update skipped, within 1-hour interval', { challengeId, userId, lastUpdate: participant.lastUpdate, now });
      res.status(204).send('No update needed within hour');
    }
  } catch (err) {
    logger.error('Error updating progress', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/leaderboard', authMiddleware, async (req, res) => {
  try {
    const { challengeId } = req.query;
    if (!challengeId) {
      return res.status(400).json({ message: 'challengeId is required' });
    }

    const challenge = await Challenge.findOne({ challengeId }).lean();
    if (!challenge) {
      return res.status(404).json({ message: 'Challenge not found' });
    }

    if (!challenge.participants || !Array.isArray(challenge.participants) || challenge.participants.length === 0) {
      return res.status(400).json({ message: 'No participants in this challenge' });
    }

    let rank = 1;
    const rankedParticipants = challenge.participants
      .sort((a, b) => b.reduction - a.reduction)
      .map((participant, index) => ({
        ...participant,
        rank: index + 1,
      }))
      .slice(0, 10);

    const allUserIds = rankedParticipants.map(p => p.userId);

    const users = await User.find(
      {
        $or: [
          { userId: { $in: allUserIds } },
          {
            _id: {
              $in: allUserIds
                .map(id => {
                  try {
                    return new mongoose.Types.ObjectId(id);
                  } catch (e) {
                    return null;
                  }
                })
                .filter(id => id !== null),
            },
          },
        ],
      },
      'username userId _id'
    ).lean();

    const leaderboard = rankedParticipants.map(participant => {
      const match = users.find(
        u =>
          u.userId === participant.userId ||
          u._id.toString() === participant.userId
      );

      return {
        rank: participant.rank,
        userId: participant.userId,
        username: match ? match.username : 'Anonymous',
        reduction: participant.reduction / 3600,
      };
    });

    res.status(200).json(leaderboard);
  } catch (err) {
    logger.error('Error fetching leaderboard', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export const updateProgress = async (req, res) => {
  try {
    const { challengeId, userId, totalTime } = req.body;
    if (!challengeId || !userId || !totalTime) {
      return res
        .status(400)
        .json({ message: 'challengeId, userId, and totalTime are required' });
    }

    const challenge = await Challenge.findOne({ challengeId });
    if (!challenge)
      return res.status(404).json({ message: 'Challenge not found' });

    const participant = challenge.participants.find(p => p.userId === userId);
    if (!participant)
      return res.status(404).json({ message: 'User not in challenge' });

    const initialTime = participant.initialScreenTime || totalTime;
    participant.initialScreenTime = initialTime;
    participant.currentScreenTime = totalTime;
    participant.reduction = (initialTime - totalTime) / 3600;
    await challenge.save();

    res
      .status(200)
      .json({ message: 'Progress updated', reduction: participant.reduction });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export default router;