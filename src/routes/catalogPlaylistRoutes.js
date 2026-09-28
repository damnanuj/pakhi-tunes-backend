import { Router } from 'express';
import { getCatalogPlaylistSongs } from '../controllers/catalogPlaylistController.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';

const router = Router();

router.use(ensureDbConnection);

router.get('/:playlistId/songs', getCatalogPlaylistSongs);

export default router;
