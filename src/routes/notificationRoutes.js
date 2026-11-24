import { Router } from 'express';
import {
  cancel,
  create,
  getById,
  list,
  remove,
  resend,
  send,
  stats,
} from '../controllers/notificationController.js';
import { auth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';
import { limiters } from '../middlewares/rateLimit.js';

const router = Router();

const notificationSendLimiter = limiters.notificationSend;

router.use(ensureDbConnection);
router.use(auth, requireAdmin);

router.get('/stats', stats);
router.get('/', list);
router.post('/', notificationSendLimiter, create);
router.get('/:id', getById);
router.post('/:id/send', notificationSendLimiter, send);
router.post('/:id/resend', notificationSendLimiter, resend);
router.post('/:id/cancel', cancel);
router.delete('/:id', remove);

export default router;
