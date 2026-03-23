import { Router } from 'express';
import { getNewReleases } from '../controllers/newReleasesController.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';

const router = Router();

router.use(ensureDbConnection);

router.get('/', getNewReleases);

export default router;
