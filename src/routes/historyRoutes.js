import { Router } from 'express';
import {
  getHistory,
  upsertHistory,
  bulkUpsertHistory,
  removeHistoryEntry,
  clearHistory,
} from '../controllers/historyController.js';
import { auth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';

const router = Router();

router.use(ensureDbConnection);
router.use(auth);

router.get('/', getHistory);
router.post('/', upsertHistory);
router.post('/bulk', bulkUpsertHistory);
router.delete('/', clearHistory);
router.delete('/:songId', removeHistoryEntry);

export default router;
