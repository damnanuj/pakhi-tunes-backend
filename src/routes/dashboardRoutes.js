import { Router } from 'express';
import { getDashboard } from '../controllers/dashboardController.js';
import { auth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';

const router = Router();

router.use(ensureDbConnection);
router.get('/', auth, requireAdmin, getDashboard);

export default router;
