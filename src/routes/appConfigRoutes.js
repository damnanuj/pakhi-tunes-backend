import { Router } from 'express';
import {
  deleteAppConfig,
  getAdminAppConfig,
  getAppConfig,
  updateAppConfig,
} from '../controllers/appConfigController.js';
import { auth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';

const router = Router();

router.use(ensureDbConnection);

router.get('/', getAppConfig);
router.get('/manage', auth, requireAdmin, getAdminAppConfig);
router.patch('/', auth, requireAdmin, updateAppConfig);
router.delete('/', auth, requireAdmin, deleteAppConfig);

export default router;
