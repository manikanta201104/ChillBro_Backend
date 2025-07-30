import express from 'express';
import  logger  from 'winston';

const router = express.Router();

router.get('/', (req, res) => {
  logger.info('Health check endpoint called');
  res.status(200).send('Server is running');
});

export default router;