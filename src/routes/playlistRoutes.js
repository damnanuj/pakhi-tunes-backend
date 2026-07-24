import { Router } from 'express';
import {
  getPlaylists,
  createPlaylist,
  getPlaylist,
  updatePlaylist,
  deletePlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  addSongToPlaylists,
  getPlaylistsContainingSong,
} from '../controllers/playlistController.js';
import { auth } from '../middlewares/auth.js';
import { ensureDbConnection } from '../middlewares/ensureDbConnection.js';

const router = Router();

router.use(ensureDbConnection);
router.use(auth);

router.get('/', getPlaylists);
router.post('/', createPlaylist);
router.post('/add-song', addSongToPlaylists);
router.get('/containing/:songId', getPlaylistsContainingSong);
router.get('/:id', getPlaylist);
router.patch('/:id', updatePlaylist);
router.delete('/:id', deletePlaylist);
router.post('/:id/songs', addSongToPlaylist);
router.delete('/:id/songs/:songId', removeSongFromPlaylist);

export default router;
