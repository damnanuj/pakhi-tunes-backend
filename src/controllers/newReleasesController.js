import { scrapeNewReleases } from '../scrapers/newReleasesScraper.js';
import { successPaginated } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

export const getNewReleases = asyncHandler(async (req, res) => {
  const limit = Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || DEFAULT_OFFSET);
  const language = typeof req.query.language === 'string' ? req.query.language : '';

  const { results, total } = await scrapeNewReleases(language, limit, offset);

  successPaginated(res, results, total, limit, offset, 200, req);
});
