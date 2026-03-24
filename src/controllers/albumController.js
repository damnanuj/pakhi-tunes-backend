import { scrapeAlbumSongs } from '../scrapers/albumSongsScraper.js';
import { successPaginated } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

export const getAlbumSongs = asyncHandler(async (req, res) => {
  const albumId = req.params.albumId || req.params.encryptedId;
  const limit = Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || DEFAULT_OFFSET);

  const { album, songs, total } = await scrapeAlbumSongs(albumId, limit, offset);

  if (!album) {
    return res.status(404).json({
      data: null,
      error: { message: 'Album not found' },
      isSuccess: false,
    });
  }

  successPaginated(res, songs, total, limit, offset, 200, req, { album });
});
