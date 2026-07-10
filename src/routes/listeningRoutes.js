import { Router } from 'express';
import {
  getLive,
  getPopularSongs,
  getSongListenerList,
  getUserSongs,
  getUserSummary,
  listListeningGuests,
  listListeningUsers,
  report,
} from '../controllers/listeningController.js';
import { auth, optionalAuth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';

const router = Router();

router.use(ensureDbConnection);

router.post('/report', optionalAuth, report);

router.get('/live', auth, requireAdmin, getLive);
router.get('/users', auth, requireAdmin, listListeningUsers);
router.get('/guests', auth, requireAdmin, listListeningGuests);
router.get('/user/:userId/songs', auth, requireAdmin, getUserSongs);
router.get('/user/:userId/summary', auth, requireAdmin, getUserSummary);
router.get('/songs/popular', auth, requireAdmin, getPopularSongs);
router.get('/songs/:songId/listeners', auth, requireAdmin, getSongListenerList);

export default router;
