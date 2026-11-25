import { Router } from 'express';
import { register, login, googleLogin, getMe } from '../controllers/authController.js';
import { auth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';
import { loginLockoutGate } from '../middlewares/loginLockoutGate.js';

const router = Router();

router.use(ensureDbConnection);

router.post('/register', register);
router.post('/login', loginLockoutGate, login);
router.post('/google', googleLogin);
router.get('/me', auth, getMe);

export default router;
