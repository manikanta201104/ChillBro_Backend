import jwt from 'jsonwebtoken';
import { logger } from '../index.js';
import { config } from '../config/env.js';

export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('Authorization header missing or malformed');
    return res.status(401).json({ message: 'Authorization header missing or malformed' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = { userId: decoded.userId }; // Ensure userId is a string from JWT
    next();
  } catch (error) {
    logger.warn('Invalid token', { error: error.message });
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired', error: error.message });
    }
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};