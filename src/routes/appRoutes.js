import { Router } from 'express';
import { createReview, getAppDetails } from '../controllers/appListingController.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';

const router = Router();

router.use(ensureDbConnection);

router.get('/:slug', getAppDetails);
router.post('/:slug/reviews', createReview);

export default router;
