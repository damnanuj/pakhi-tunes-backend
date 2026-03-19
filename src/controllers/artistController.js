import { scrapeTopArtists } from '../scrapers/topArtistsScraper.js';
import { scrapeArtistSongs } from '../scrapers/artistSongsScraper.js';
import { successPaginated } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

export const getTopArtists = asyncHandler(async (req, res) => {
  const limit = Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || DEFAULT_OFFSET);

  const artists = await scrapeTopArtists();
  const count = artists.length;
  const results = artists.slice(offset, offset + limit);

  successPaginated(res, results, count, limit, offset, 200, req);
});

export const getArtistSongs = asyncHandler(async (req, res) => {
  const id = req.params.artistId || req.params.encryptedId;
  const limit = Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || DEFAULT_OFFSET);

  const { artist, songs, total } = await scrapeArtistSongs(id, limit, offset);

  successPaginated(res, songs, total, limit, offset, 200, req, artist ? { artist } : {});
});
