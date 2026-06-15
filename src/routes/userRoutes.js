import { Router } from 'express';
import { getUsers, getUser, createUser } from '../controllers/userController.js';
import { optionalAuth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';

const router = Router();

router.use(ensureDbConnection);
router.use(optionalAuth);

router.get('/', getUsers);
router.get('/:id', getUser);
router.post('/', createUser);

export default router;
