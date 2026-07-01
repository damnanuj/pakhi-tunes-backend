import { Router } from 'express';
import { createReview, getAppDetails, incrementDownloadCount } from '../controllers/appListingController.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';

const router = Router();

router.use(ensureDbConnection);

router.post('/:slug/downloads', incrementDownloadCount);
router.post('/:slug/reviews', createReview);
router.get('/:slug', getAppDetails);

export default router;
