import { Router } from 'express';
import {
  upsertSession,
  getNearbySessions,
  deleteSession,
  updateSessionPosition,
  getMySession,
} from '../controllers/sessionController.js';
import { auth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';

const router = Router();

router.use(ensureDbConnection);
router.use(auth);

router.get('/nearby', getNearbySessions);
router.get('/me', getMySession);
router.post('/', upsertSession);
router.patch('/:id/position', updateSessionPosition);
router.delete('/:id', deleteSession);

export default router;
