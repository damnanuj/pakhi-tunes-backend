import { Router } from 'express';
import { getGenres, getGenreSongs } from '../controllers/genreController.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';

const router = Router();

router.use(ensureDbConnection);

router.get('/', getGenres);
router.get('/:genre/songs', getGenreSongs);

export default router;
