import { Router } from 'express';
import { getUser, updateDiscoverable } from '../controllers/userController.js';
import { auth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';
import { requireSelf } from '../middlewares/requireSelf.js';

const router = Router();

router.use(ensureDbConnection);

router.patch('/me/discoverable', auth, updateDiscoverable);
router.get('/:id', auth, requireSelf, getUser);

export default router;
