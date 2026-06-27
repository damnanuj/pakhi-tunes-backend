import { Router } from 'express';
import { getUsers, getUser, createUser, updateDiscoverable } from '../controllers/userController.js';
import { auth, optionalAuth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';

const router = Router();

router.use(ensureDbConnection);
router.use(optionalAuth);

router.patch('/me/discoverable', auth, updateDiscoverable);

router.get('/', getUsers);
router.get('/:id', getUser);
router.post('/', createUser);

export default router;
