import { Router } from 'express';
import {
  deleteUserAdmin,
  getUser,
  listUsersAdmin,
  toggleUserBan,
  updateDiscoverable,
} from '../controllers/userController.js';
import { auth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';
import { requireSelf } from '../middlewares/requireSelf.js';

const router = Router();

router.use(ensureDbConnection);

router.patch('/me/discoverable', auth, updateDiscoverable);
router.get('/admin/list', auth, requireAdmin, listUsersAdmin);
router.patch('/:id/ban', auth, requireAdmin, toggleUserBan);
router.delete('/:id', auth, requireAdmin, deleteUserAdmin);
router.get('/:id', auth, requireSelf, getUser);

export default router;
