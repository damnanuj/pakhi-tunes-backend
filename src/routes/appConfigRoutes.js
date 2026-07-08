import { Router } from 'express';
import { getAppConfig, updateAppConfig } from '../controllers/appConfigController.js';
import { auth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';

const router = Router();

router.use(ensureDbConnection);

router.get('/', getAppConfig);
router.patch('/', auth, requireAdmin, updateAppConfig);

export default router;
