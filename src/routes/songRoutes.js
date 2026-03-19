import { Router } from 'express';
import { getSong } from '../controllers/songController.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';

const router = Router();

router.use(ensureDbConnection);


router.get('/:id', getSong);

export default router;
