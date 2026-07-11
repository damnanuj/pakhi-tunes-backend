import { Router } from 'express';
import {
  end,
  getLive,
  getStatsRange,
  getToday,
  heartbeat,
} from '../controllers/presenceController.js';
import { auth, optionalAuth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';

const router = Router();

router.use(ensureDbConnection);

router.post('/heartbeat', optionalAuth, heartbeat);
router.post('/end', optionalAuth, end);

router.get('/live', auth, requireAdmin, getLive);
router.get('/stats/today', auth, requireAdmin, getToday);
router.get('/stats', auth, requireAdmin, getStatsRange);

export default router;
