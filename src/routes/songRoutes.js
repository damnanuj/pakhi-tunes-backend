import { Router } from 'express';
import { getSong, getSongsBySearch } from '../controllers/songController.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';

const router = Router();

router.use(ensureDbConnection);

router.get('/search', getSongsBySearch);
router.get('/:id', getSong);

export default router;
