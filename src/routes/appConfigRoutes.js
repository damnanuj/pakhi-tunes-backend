import { Router } from 'express';
import { getAppConfig } from '../controllers/appConfigController.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';

const router = Router();

router.use(ensureDbConnection);

router.get('/', getAppConfig);

export default router;
