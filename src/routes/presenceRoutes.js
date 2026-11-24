import { Router } from 'express';
import {
  end,
  heartbeat,
} from '../controllers/presenceController.js';
import { optionalAuth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';

const router = Router();

router.use(ensureDbConnection);

router.post('/heartbeat', optionalAuth, heartbeat);
router.post('/end', optionalAuth, end);

export default router;
