import { scrapeCatalogPlaylist } from '../scrapers/catalogPlaylistScraper.js';
import { successPaginated } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

export const getCatalogPlaylistSongs = asyncHandler(async (req, res) => {
  const playlistId = req.params.playlistId;
  const limit = Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || DEFAULT_OFFSET);

  const { playlist, songs, total } = await scrapeCatalogPlaylist(playlistId, limit, offset);

  if (!playlist) {
    return res.status(404).json({
      data: null,
      error: { message: 'Playlist not found' },
      isSuccess: false,
    });
  }

  successPaginated(res, songs, total, limit, offset, 200, req, { playlist });
});
