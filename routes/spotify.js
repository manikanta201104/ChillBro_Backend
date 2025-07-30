
import express from 'express';
import SpotifyWebApi from 'spotify-web-api-node';
import { logger } from '../index.js';
import { authMiddleware } from '../middleware/auth.js';
import User from '../models/user.js';
import Playlist from '../models/playlist.js';

const router = express.Router();

// Spotify API setup
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});

// Scopes for Spotify permissions (updated to include streaming)
const scopes = ['user-read-private', 'streaming', 'user-read-email'];

// Mood to Spotify category mapping
const moodCategoryMap = {
  stressed: 'calm',
  tired: 'relax',
  happy: 'upbeat',
  sad: 'chill',
  angry: 'energetic',
  calm: 'chill',
  neutral: 'chill',
  default: 'chill',
};

// Function to refresh access token
const refreshAccessToken = async (userId, refreshToken) => {
  const spotifyApiRefresh = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    refreshToken,
  });

  try {
    const data = await spotifyApiRefresh.refreshAccessToken();
    const { access_token, expires_in } = data.body;

    if (!access_token || !expires_in) {
      throw new Error('Invalid response from Spotify token refresh');
    }

    const updatedUser = await User.findOneAndUpdate(
      { userId },
      {
        spotifyToken: {
          accessToken: access_token,
          refreshToken,
          expiresIn: expires_in,
          obtainedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      throw new Error('User not found during token update');
    }

    logger.info('Access token refreshed successfully', { userId, expiresIn: expires_in });
    return access_token;
  } catch (err) {
    const errorDetail = err.body ? `${err.message} - ${JSON.stringify(err.body)}` : err.message;
    logger.error('Error refreshing access token', {
      error: errorDetail,
      stack: err.stack,
      statusCode: err.statusCode,
    });
    throw new Error(`Failed to refresh access token: ${errorDetail}`);
  }
};

// GET /spotify/login
router.get('/login', authMiddleware, (req, res) => {
  const userId = req.user.userId;
  const state = Buffer.from(userId).toString('base64');
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);
  res.status(200).json({ authorizeURL });
});

// GET /spotify/callback
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    logger.error('Spotify authorization error', { error });
    return res.status(400).json({ message: 'Spotify authorization failed', error });
  }

  const userId = Buffer.from(state, 'base64').toString();

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      logger.error('User not found during Spotify callback', { userId });
      return res.status(404).json({ message: 'User not found' });
    }

    const data = await spotifyApi.authorizationCodeGrant(code);
    const { access_token, refresh_token, expires_in } = data.body;

    await User.findOneAndUpdate(
      { userId },
      {
        spotifyToken: {
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresIn: expires_in,
          obtainedAt: new Date(),
        },
      },
      { new: true }
    );

    logger.info('Spotify tokens saved for user', { userId });
    res.redirect('http://localhost:3000/dashboard');
  } catch (err) {
    logger.error('Error in Spotify callback', { error: err.message, stack: err.stack });
    if (err.body && err.body.error === 'invalid_grant') {
      return res.status(400).json({ message: 'Invalid authorization code', error: err.message });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/playlist', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const mood = req.query.mood || 'default';
  const skip = req.query.skip === 'true';

  try {
    const user = await User.findOne({ userId });
    if (!user || !user.spotifyToken || !user.spotifyToken.accessToken) {
      return res.status(400).json({ message: 'Spotify token not found' });
    }

    const { accessToken, refreshToken, expiresIn, obtainedAt } = user.spotifyToken;
    const now = Date.now();
    const tokenExpiry = new Date(obtainedAt).getTime() + expiresIn * 1000;

    let currentAccessToken = accessToken;
    if (now >= tokenExpiry) {
      logger.info('Token expired, refreshing', { userId, tokenExpiry });
      currentAccessToken = await refreshAccessToken(userId, refreshToken);
      if (!currentAccessToken) {
        return res.status(500).json({ message: 'Failed to refresh access token' });
      }
    } else {
      logger.info('Token still valid', { userId, tokenExpiry });
    }

    // Invalidate cache when skipping to ensure a new playlist
    let cachedPlaylist = null;
    if (!skip) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      cachedPlaylist = await Playlist.findOne({
        userId,
        mood: moodCategoryMap[mood.toLowerCase()] || moodCategoryMap.default,
        createdAt: { $gte: twentyFourHoursAgo },
        saved: { $ne: true }
      }).sort({ createdAt: -1 });

      if (cachedPlaylist) {
        logger.info('Returning cached playlist', { userId, playlistId: cachedPlaylist.spotifyPlaylistId });
        return res.status(200).json({ spotifyPlaylistId: cachedPlaylist.spotifyPlaylistId, name: cachedPlaylist.name, mood });
      }
    }

    // Always fetch a new playlist when skipping
    if (skip || !cachedPlaylist) {
      spotifyApi.setAccessToken(currentAccessToken);

      const category = moodCategoryMap[mood.toLowerCase()] || moodCategoryMap.default;

      let playlists;
      try {
        playlists = await spotifyApi.searchPlaylists(`category:${category}`, { limit: 10 });
        logger.info('Spotify API response', { items: playlists.body.playlists?.items?.map(p => ({ id: p?.id, name: p?.name })) || [] });
      } catch (searchErr) {
        logger.error('Spotify API error', { error: searchErr.message, stack: searchErr.stack, statusCode: searchErr.statusCode });
        throw searchErr;
      }

      if (!playlists.body.playlists || !playlists.body.playlists.items || playlists.body.playlists.items.length === 0) {
        return res.status(404).json({ message: 'No playlists found for this mood' });
      }

      const availablePlaylists = playlists.body.playlists.items.filter(p => !cachedPlaylist || p.id !== cachedPlaylist?.spotifyPlaylistId);
      if (availablePlaylists.length === 0 && !skip) {
        logger.warn('No new playlists available, forcing new search');
        playlists = await spotifyApi.searchPlaylists(`category:${category} calm`, { limit: 10 });
        logger.info('Spotify API response (retry)', { items: playlists.body.playlists?.items?.map(p => ({ id: p?.id, name: p?.name })) || [] });
        if (!playlists.body.playlists || !playlists.body.playlists.items || playlists.body.playlists.items.length === 0) {
          return res.status(404).json({ message: 'No new playlists available after retry' });
        }
        availablePlaylists = playlists.body.playlists.items.filter(p => !cachedPlaylist || p.id !== cachedPlaylist?.spotifyPlaylistId);
      }

      const playlist = availablePlaylists[Math.floor(Math.random() * availablePlaylists.length)];
      const response = { spotifyPlaylistId: playlist.id, name: playlist.name, mood: mood.toLowerCase() };

      const existingPlaylist = await Playlist.findOne({ spotifyPlaylistId: playlist.id });
      if (!existingPlaylist) {
        const newPlaylist = new Playlist({
          userId,
          spotifyPlaylistId: playlist.id,
          name: playlist.name,
          mood: category,
          saved: false,
        });
        await newPlaylist.save();
        logger.info('New playlist saved', { userId, playlistId: playlist.id });
      } else if (skip) {
        // Update existing playlist to mark it as used and reset cache
        await Playlist.findOneAndUpdate(
          { spotifyPlaylistId: playlist.id },
          { createdAt: new Date(), saved: false },
          { new: true }
        );
      }

      res.status(200).json(response);
    } else {
      logger.info('No mood change detected, returning cached playlist', { userId, mood });
      res.status(200).json({ spotifyPlaylistId: cachedPlaylist.spotifyPlaylistId, name: cachedPlaylist.name, mood });
    }
  } catch (err) {
    logger.error('Error fetching playlist', { error: err.message, stack: err.stack, statusCode: err.statusCode });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.patch('/playlist/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { saved } = req.body;

  try {
    const playlist = await Playlist.findOneAndUpdate(
      { spotifyPlaylistId: id, userId: req.user.userId },
      { saved: saved === true },
      { new: true, runValidators: true }
    );

    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' });
    }

    logger.info('Playlist updated', { spotifyPlaylistId: id, saved: playlist.saved });
    res.status(200).json(playlist);
  } catch (err) {
    logger.error('Error updating playlist', { error: err.message, stack: err.stack });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.delete('/unlink', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const user = await User.findOne({ userId });
    if (!user) return res.status(400).json({ message: 'User not found' });

    user.spotifyToken = null;
    await user.save();

    await Playlist.deleteMany({ userId, saved: true });

    logger.info('Spotify account unlinked successfully', { userId });
    res.status(200).json({ message: 'Spotify account unlinked successfully' });
  } catch (error) {
    logger.error('Error unlinking Spotify account', { error: error.message, stack: error.stack });
    res.status(500).json({ message: error.message });
  }
});

export default router;