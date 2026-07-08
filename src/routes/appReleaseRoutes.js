import { Router } from 'express';
import {
  createAppRelease,
  getAppRelease,
  getAppReleases,
  patchAppRelease,
  publishAppRelease,
  removeAppRelease,
} from '../controllers/appReleaseController.js';
import { auth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';

const router = Router();

router.use(ensureDbConnection);
router.use(auth, requireAdmin);

router.get('/', getAppReleases);
router.post('/', createAppRelease);
router.get('/:id', getAppRelease);
router.patch('/:id', patchAppRelease);
router.delete('/:id', removeAppRelease);
router.post('/:id/publish', publishAppRelease);

export default router;
