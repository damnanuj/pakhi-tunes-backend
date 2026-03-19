import { fetchSongByToken } from '../scrapers/songDetailsScraper.js';
import { success } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getSong = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const baseUrl = process.env.SCRAPER_SOURCE_BASE_URL;
  if (!baseUrl || !id) {
    return res.status(400).json({
      data: null,
      error: { message: 'Missing song id or SCRAPER_SOURCE_BASE_URL' },
      isSuccess: false,
    });
  }
  const song = await fetchSongByToken(baseUrl, id);
  if (!song) {
    return res.status(404).json({
      data: null,
      error: { message: 'Song not found' },
      isSuccess: false,
    });
  }
  success(res, song);
});
