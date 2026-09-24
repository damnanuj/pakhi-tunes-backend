import { fetchCatalogSuggestions } from '../scrapers/catalogSearchScraper.js';
import { fetchSongByToken } from '../scrapers/songDetailsScraper.js';
import { searchSongs } from '../scrapers/songSearchScraper.js';
import { fetchSongSuggestions } from '../scrapers/songSuggestionsScraper.js';
import { success, successPaginated } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;
const SUGGESTIONS_MAX_LIMIT = 40;

export const getSongsBySearch = asyncHandler(async (req, res) => {
  const q = req.query.q ?? req.query.query ?? '';
  const limit = Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || DEFAULT_OFFSET);
  const baseUrl = process.env.SCRAPER_SOURCE_BASE_URL;

  if (!baseUrl) {
    return res.status(400).json({
      data: null,
      error: { message: 'Missing SCRAPER_SOURCE_BASE_URL' },
      isSuccess: false,
    });
  }

  const trimmed = String(q).trim();
  if (!trimmed) {
    return res.status(400).json({
      data: null,
      error: { message: 'Missing search query (use q or query)' },
      isSuccess: false,
    });
  }

  const isFirstPage = offset === 0;
  let albums = [];
  let artists = [];
  let songs = [];
  let total = 0;

  if (isFirstPage) {
    const [suggestionsResult, songsResult] = await Promise.allSettled([
      fetchCatalogSuggestions(baseUrl, trimmed),
      searchSongs(baseUrl, trimmed, limit, offset),
    ]);

    if (suggestionsResult.status === 'fulfilled') {
      albums = suggestionsResult.value.albums ?? [];
      artists = suggestionsResult.value.artists ?? [];
    }

    if (songsResult.status === 'fulfilled') {
      songs = songsResult.value.songs ?? [];
      total = songsResult.value.total ?? 0;
    }

    const suggestionsFailed = suggestionsResult.status === 'rejected';
    const songsFailed = songsResult.status === 'rejected';

    if (suggestionsFailed && songsFailed) {
      return res.status(502).json({
        data: null,
        error: { message: 'Search unavailable' },
        isSuccess: false,
      });
    }
  } else {
    const result = await searchSongs(baseUrl, trimmed, limit, offset);
    songs = result.songs;
    total = result.total;
  }

  const extra = isFirstPage ? { albums, artists } : {};
  successPaginated(res, songs, total, limit, offset, 200, req, extra);
});

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

export const getSongSuggestions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const limit = Math.min(
    SUGGESTIONS_MAX_LIMIT,
    Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT)
  );
  const offset = Math.max(0, parseInt(req.query.offset, 10) || DEFAULT_OFFSET);
  const baseUrl = process.env.SCRAPER_SOURCE_BASE_URL;

  if (!baseUrl || !id) {
    return res.status(400).json({
      data: null,
      error: { message: 'Missing song id or SCRAPER_SOURCE_BASE_URL' },
      isSuccess: false,
    });
  }

  const { songs, total } = await fetchSongSuggestions(baseUrl, id, limit, offset);
  successPaginated(res, songs, total, limit, offset, 200, req, { seedSongId: id });
});
