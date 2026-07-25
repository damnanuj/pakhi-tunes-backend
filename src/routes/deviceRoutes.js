import { Router } from 'express';
import {
  list,
  register,
  unlink,
  unregister,
} from '../controllers/deviceController.js';
import { auth, optionalAuth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';

const router = Router();

router.use(ensureDbConnection);

router.post('/register', optionalAuth, register);
router.post('/unlink', optionalAuth, unlink);
router.delete('/:installationId', optionalAuth, unregister);

router.get('/', auth, requireAdmin, list);

export default router;
