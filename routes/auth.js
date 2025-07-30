import express from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../index.js';
import User from '../models/user.js';
import { config } from '../config/env.js';
import { authMiddleware } from '../middleware/auth.js';
import Playlist from '../models/playlist.js';

const router = express.Router();

// POST /auth/signup
router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      logger.warn('Signup failed: Email already exists', { email });
      return res.status(400).json({ message: 'Email already exists' });
    }

    const userId = `user_${Date.now()}`;
    const accessToken = jwt.sign({ userId }, config.jwtSecret, { expiresIn: '24h' });
    const refreshToken = jwt.sign({ userId }, config.jwtSecret, { expiresIn: '7d' });

    const user = new User({
      userId,
      username,
      email,
      password,
      spotifyToken: {
        accessToken,
        refreshToken,
        expiresIn: 86400, // 24 hours in seconds
        obtainedAt: new Date(),
      },
      preferences: {},
    });

    await user.save();

    logger.info('User signed up successfully', { email });
    res.status(201).json({ token: accessToken, refreshToken, userId });
  } catch (error) {
    logger.error('Error during signup:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      logger.warn('Login failed: User not found', { email });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      logger.warn('Login failed: Invalid password', { email });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const accessToken = jwt.sign({ userId: user.userId }, config.jwtSecret, { expiresIn: '24h' });
    const refreshToken = jwt.sign({ userId: user.userId }, config.jwtSecret, { expiresIn: '7d' });
    user.spotifyToken = {
      accessToken,
      refreshToken,
      expiresIn: 86400, // 24 hours in seconds
      obtainedAt: new Date(),
    };
    await user.save();

    // Signal frontend to clear old challenge data and set new userId
    logger.info('User logged in successfully', { email, userId: user.userId });
    res.status(200).json({ 
      token: accessToken, 
      refreshToken, 
      userId: user.userId,
      clearChallengeData: true // Flag to trigger state reset on frontend
    });
  } catch (error) {
    logger.error('Error during login:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /auth/profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.userId }).select('username email spotifyToken');
    if (!user) {
      logger.warn('User not found', { userId: req.user.userId });
      return res.status(404).json({ message: 'User not found' });
    }

    logger.info('Profile fetched successfully', { userId: req.user.userId });
    res.status(200).json({ username: user.username, email: user.email, spotifyToken: user.spotifyToken });
  } catch (error) {
    logger.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /user
router.get('/user', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.userId }).select('spotifyToken preferences');
    if (!user) {
      logger.warn('User not found', { userId: req.user.userId });
      return res.status(404).json({ message: 'User not found' });
    }

    logger.info('User data fetched successfully', { userId: req.user.userId });
    res.status(200).json(user);
  } catch (error) {
    logger.error('Error fetching user data:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /auth/playlists
router.get('/playlists', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const playlists = await Playlist.find({ userId, saved: true }).select('name mood spotifyPlaylistId');
    logger.info('Playlists fetched successfully', { userId });
    res.status(200).json(playlists);
  } catch (error) {
    logger.error('Error fetching playlists:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /settings
router.post('/settings', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { webcamEnabled, notifyEvery, showOnLeaderboard } = req.body;

    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.preferences = { webcamEnabled, notifyEvery, showOnLeaderboard };
    await user.save();

    res.status(200).json({ message: 'Settings saved successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;