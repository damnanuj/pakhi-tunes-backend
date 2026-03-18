import { Router } from 'express';
import { getTopArtists } from '../controllers/artistController.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';

const router = Router();

router.use(ensureDbConnection);
router.get('/', getTopArtists);

export default router;
