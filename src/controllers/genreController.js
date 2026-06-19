import { scrapeGenres, scrapeGenreSongs } from '../scrapers/genreScraper.js';
import { success, successPaginated } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;
const MAX_LIMIT = 50;

export const getGenres = asyncHandler(async (req, res) => {
  const genres = await scrapeGenres();
  success(res, genres);
});

export const getGenreSongs = asyncHandler(async (req, res) => {
  const genre = req.params.genre;
  const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(req.query.limit, 10) || DEFAULT_LIMIT));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || DEFAULT_OFFSET);

  const { genre: genreMeta, songs, total } = await scrapeGenreSongs(genre, limit, offset);

  if (!genreMeta) {
    return res.status(404).json({
      data: null,
      error: { message: 'Genre not found' },
      isSuccess: false,
    });
  }

  successPaginated(res, songs, total, limit, offset, 200, req, { genre: genreMeta });
});
