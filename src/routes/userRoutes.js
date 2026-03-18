import { Router } from 'express';
import { getUsers, getUser, createUser } from '../controllers/userController.js';
import { auth } from '../middlewares/auth.js';

const router = Router();

router.use(auth);

router.get('/', getUsers);
router.get('/:id', getUser);
router.post('/', createUser);

export default router;
