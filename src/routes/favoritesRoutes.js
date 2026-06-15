import { Router } from 'express';
import {
  getFavorites,
  addFavorite,
  bulkAddFavorites,
  removeFavorite,
  getFavoriteStatus,
} from '../controllers/favoritesController.js';
import { auth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';

const router = Router();

router.use(ensureDbConnection);
router.use(auth);

router.get('/', getFavorites);
router.post('/', addFavorite);
router.post('/bulk', bulkAddFavorites);
router.get('/:songId/status', getFavoriteStatus);
router.delete('/:songId', removeFavorite);

export default router;
