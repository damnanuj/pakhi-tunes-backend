import { scrapeNewReleases, normalizeReleaseType } from '../scrapers/newReleasesScraper.js';
import { successPaginated } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { CATALOG_CACHE_TTL, getOrSet } from '../utils/catalogCache.js';

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

  const isHomepage =
    offset === 0 && language.trim() === '' && (type === 'song' || type === 'album');

  const load = () => scrapeNewReleases(language, limit, offset, type);
  const { results, total, meta } = isHomepage
    ? await getOrSet(`new-releases:${type}:${limit}`, CATALOG_CACHE_TTL.newReleases, load)
    : await load();

  successPaginated(res, results, total, limit, offset, 200, req, { meta });
});
