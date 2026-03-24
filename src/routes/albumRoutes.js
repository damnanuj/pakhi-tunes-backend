import { Router } from 'express';
import { getAlbumSongs } from '../controllers/albumController.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';

const router = Router();

router.use(ensureDbConnection);

router.get('/:albumId/songs', getAlbumSongs);
router.get('/:albumSlug/:encryptedId/songs', getAlbumSongs);

export default router;
