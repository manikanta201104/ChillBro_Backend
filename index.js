import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import winston from 'winston';
import authRoutes from './routes/auth.js';
import screenTimeRoutes from './routes/screenTime.js';
import moodRoutes from './routes/mood.js';
import recommendationsRoutes from './routes/recommendations.js';
import spotifyRoutes from './routes/spotify.js';
import challengesRoutes from './routes/challenges.js';
import contactRoutes from './routes/contact.js';

dotenv.config();

// Logger setup
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

const app = express();

// Configure CORS to allow Chrome extension origin
const allowedOrigins = [
  'http://localhost:3000',
  'chrome-extension://cohlihkpndpeoklcbgcgaobmoojpdhpg'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // Optional: only if you're using cookies/auth headers
}));


app.use(express.json());

app.get('/test', (req, res) => {
  logger.info('Received GET request at /test');
  res.status(200).json({ message: 'Server is running' });
});

app.patch('/test-patch', (req, res) => {
  res.status(200).json({ message: 'PATCH request received' });
});

app.use('/auth', authRoutes);
app.use('/screen-time', screenTimeRoutes);
app.use('/mood', moodRoutes);
app.use('/recommendations', recommendationsRoutes);
app.use('/ping', (req, res) => {
  logger.info('Received GET request at /ping');
  res.status(200).json({ message: 'Pong' });
});
app.use('/spotify', spotifyRoutes);
app.use('/challenges',challengesRoutes);
app.use('/contact',contactRoutes);

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => logger.info('Connected to MongoDB'))
  .catch((err) => logger.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});