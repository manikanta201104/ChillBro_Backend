import mongoose from 'mongoose';
import logger  from '../logger.js'; // FIXED: Winston logger must come from correct import
import { config } from '../config/env.js';

const connectDB = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    logger.info('Connected to MongoDB');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

export default connectDB;
