import { Router } from 'express';
import {
  getFavorites,
  addFavorite,
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
router.get('/:songId/status', getFavoriteStatus);
router.delete('/:songId', removeFavorite);

export default router;
