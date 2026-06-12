import { scrapeNewReleases, normalizeReleaseType } from '../scrapers/newReleasesScraper.js';
import { successPaginated } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

export const getNewReleases = asyncHandler(async (req, res) => {
  const limit = Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || DEFAULT_OFFSET);
  const language = typeof req.query.language === 'string' ? req.query.language : '';
  const typeRaw = typeof req.query.type === 'string' ? req.query.type : '';
  const type = normalizeReleaseType(typeRaw);

  if (typeRaw.trim() && !type) {
    return res.status(400).json({
      data: null,
      error: { message: 'Invalid type (use song or album)' },
      isSuccess: false,
    });
  }

  const { results, total, meta } = await scrapeNewReleases(language, limit, offset, type);

  successPaginated(res, results, total, limit, offset, 200, req, { meta });
});
