import { Router } from 'express';
import {
  cancel,
  create,
  getById,
  list,
  remove,
  send,
  stats,
} from '../controllers/notificationController.js';
import { auth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';
import { createRateLimiter } from '../middlewares/rateLimit.js';

const router = Router();

const notificationSendLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 60_000,
  message: 'Notification send rate limit exceeded. Max 10 per minute.',
});

router.use(ensureDbConnection);
router.use(auth, requireAdmin);

router.get('/stats', stats);
router.get('/', list);
router.post('/', notificationSendLimiter, create);
router.get('/:id', getById);
router.post('/:id/send', notificationSendLimiter, send);
router.post('/:id/cancel', cancel);
router.delete('/:id', remove);

export default router;
