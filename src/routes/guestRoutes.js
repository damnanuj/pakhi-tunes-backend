import { Router } from 'express';
import {
  deleteGuest,
  getGuestStats,
  listGuests,
  pingGuest,
  toggleGuestBan,
} from '../controllers/guestController.js';
import { auth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';

const router = Router();

router.use(ensureDbConnection);

router.post('/ping', pingGuest);

router.get('/stats', auth, requireAdmin, getGuestStats);
router.get('/', auth, requireAdmin, listGuests);
router.patch('/:id/ban', auth, requireAdmin, toggleGuestBan);
router.delete('/:id', auth, requireAdmin, deleteGuest);

export default router;
