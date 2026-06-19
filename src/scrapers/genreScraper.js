import axios from 'axios';
import { getGenreBySlug, listGenres } from '../config/genreConfig.js';
import { formatSong } from '../utils/songFormatter.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

/** @type {Map<string, { expiresAt: number, songs: object[] }>} */
const mergedSongsCache = new Map();

function buildApiUrl(baseUrl, call, params) {
  const url = new URL(`${baseUrl}/api.php`);
  url.searchParams.set('__call', call);
  url.searchParams.set('_format', 'json');
  url.searchParams.set('_marker', '0');
  url.searchParams.set('api_version', '4');
  url.searchParams.set('ctx', 'web6dot0');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function createImageLinks(input) {
  const raw = Array.isArray(input) ? input[0] : input;
  const url = typeof raw === 'string' ? raw : raw?.url ?? '';
  if (!url) return [];
  const qualities = ['50x50', '150x150', '500x500'];
  return qualities.map((q) => ({
    quality: q,
    url: url.replace(/150x150|50x50|500x500/, q).replace(/^http:\/\//, 'https://'),
  }));
}

export function normalizeGenreSlug(input) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mapGenreToListItem(genre) {
  return {
    slug: genre.slug,
    name: genre.name,
    image: createImageLinks(genre.image),
    playlistCount: genre.playlists.length,
  };
}

function mapGenreToDetail(genre, songCount) {
  return {
    slug: genre.slug,
    name: genre.name,
    songCount,
    image: createImageLinks(genre.image),
    playlistCount: genre.playlists.length,
  };
}

function deduplicateSongs(songs) {
  const seen = new Set();
  const unique = [];

  for (const song of songs) {
    const id = song?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(song);
  }

  return unique;
}

async function fetchPlaylistSongs(baseUrl, playlistId) {
  if (!playlistId || !/^\d+$/.test(String(playlistId))) return [];

  try {
    const url = buildApiUrl(baseUrl, 'playlist.getDetails', { listid: playlistId });
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': UA },
      timeout: 20000,
    });

    if (!Array.isArray(data?.list)) return [];
    return data.list.filter((item) => item?.type === 'song' && item?.id);
  } catch {
    return [];
  }
}

async function enrichSongsWithDetails(baseUrl, songs) {
  const ids = songs.map((s) => s.id).filter(Boolean);
  if (!ids.length) return songs;

  try {
    const url = buildApiUrl(baseUrl, 'song.getDetails', { pids: ids.join(',') });
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': UA },
      timeout: 20000,
    });

    const detailed = data?.songs ?? data;
    const detailedArr = Array.isArray(detailed)
      ? detailed
      : typeof detailed === 'object'
        ? Object.values(detailed)
        : [];

    const byId = new Map();
    for (const s of detailedArr) {
      if (s?.id) byId.set(s.id, s);
    }

    return songs.map((s) => byId.get(s.id) ?? s);
  } catch {
    return songs;
  }
}

async function getMergedGenreSongs(baseUrl, genre) {
  const cacheKey = genre.slug;
  const cached = mergedSongsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.songs;
  }

  const playlistIds = genre.playlists.map((p) => p.id);
  const results = await Promise.allSettled(
    playlistIds.map((id) => fetchPlaylistSongs(baseUrl, id))
  );

  const merged = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      merged.push(...result.value);
    }
  }

  const uniqueSongs = deduplicateSongs(merged);

  mergedSongsCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    songs: uniqueSongs,
  });

  return uniqueSongs;
}

/**
 * Lists all curated genres from static config (no network call).
 */
export async function scrapeGenres() {
  return listGenres().map(mapGenreToListItem);
}

/**
 * Fetches merged, deduplicated songs for a genre slug or display name.
 */
export async function scrapeGenreSongs(genreInput, limit = DEFAULT_LIMIT, offset = 0) {
  const baseUrl = process.env.SCRAPER_SOURCE_BASE_URL;
  if (!baseUrl || !genreInput) {
    return { genre: null, songs: [], total: 0 };
  }

  const genre = getGenreBySlug(genreInput);
  if (!genre) {
    return { genre: null, songs: [], total: 0 };
  }

  const mergedSongs = await getMergedGenreSongs(baseUrl, genre);
  const total = mergedSongs.length;

  const safeLimit = Math.max(1, Math.min(MAX_LIMIT, parseInt(limit, 10) || DEFAULT_LIMIT));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  const pageSlice = mergedSongs.slice(safeOffset, safeOffset + safeLimit);
  const enriched = await enrichSongsWithDetails(baseUrl, pageSlice);
  const songs = enriched.map((s) => formatSong(s, baseUrl)).filter(Boolean);

  return {
    genre: mapGenreToDetail(genre, total),
    songs,
    total,
  };
}
