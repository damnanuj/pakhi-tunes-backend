import axios from 'axios';
import { formatSong } from '../utils/songFormatter.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const STATION_CACHE_TTL_MS = 30 * 60 * 1000;
const SONGS_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_LIMIT = 40;
const DEFAULT_LIMIT = 20;

/** @type {Map<string, { expiresAt: number, stationId: string }>} */
const stationCache = new Map();

/** @type {Map<string, { expiresAt: number, songs: object[] }>} */
const songsCache = new Map();

function buildApiUrl(baseUrl, call, params) {
  const url = new URL(`${baseUrl}/api.php`);
  url.searchParams.set('__call', call);
  url.searchParams.set('_format', 'json');
  url.searchParams.set('_marker', '0');
  url.searchParams.set('api_version', '4');
  url.searchParams.set('ctx', 'android');
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function getCachedStation(songId) {
  const entry = stationCache.get(songId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    stationCache.delete(songId);
    return null;
  }
  return entry.stationId;
}

function setCachedStation(songId, stationId) {
  stationCache.set(songId, {
    stationId,
    expiresAt: Date.now() + STATION_CACHE_TTL_MS,
  });
}

function getCachedSongs(cacheKey) {
  const entry = songsCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    songsCache.delete(cacheKey);
    return null;
  }
  return entry.songs;
}

function setCachedSongs(cacheKey, songs) {
  songsCache.set(cacheKey, {
    songs,
    expiresAt: Date.now() + SONGS_CACHE_TTL_MS,
  });
}

async function createSongStation(baseUrl, songId) {
  const cached = getCachedStation(songId);
  if (cached) return cached;

  const entityId = JSON.stringify([encodeURIComponent(songId)]);
  const url = buildApiUrl(baseUrl, 'webradio.createEntityStation', {
    entity_id: entityId,
    entity_type: 'queue',
  });

  const { data } = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 20000,
  });

  const stationId = data?.stationid ?? data?.station_id ?? null;
  if (!stationId) return null;

  setCachedStation(songId, stationId);
  return stationId;
}

function extractSuggestionSongs(payload, baseUrl, seedSongId, limit) {
  if (!payload || typeof payload !== 'object') return [];

  const { stationid, station_id, ...rest } = payload;
  void stationid;
  void station_id;

  const songs = [];
  const seen = new Set(seedSongId ? [seedSongId] : []);

  for (const value of Object.values(rest)) {
    if (!value || typeof value !== 'object') continue;
    const raw = value.song ?? value;
    if (!raw?.id || seen.has(raw.id)) continue;
    const formatted = formatSong(raw, baseUrl);
    if (!formatted) continue;
    seen.add(formatted.id);
    songs.push(formatted);
    if (songs.length >= limit) break;
  }

  return songs;
}

/**
 * Fetch radio / recommendation songs for a seed track via JioSaavn webradio.
 * @returns {Promise<object[]>}
 */
export async function fetchSongSuggestions(baseUrl, songId, limit = DEFAULT_LIMIT) {
  const id = String(songId ?? '').trim();
  if (!baseUrl || !id) return [];

  const safeLimit = Math.max(1, Math.min(MAX_LIMIT, parseInt(limit, 10) || DEFAULT_LIMIT));
  const cacheKey = `${id}:${safeLimit}`;
  const cachedSongs = getCachedSongs(cacheKey);
  if (cachedSongs) return cachedSongs;

  try {
    const stationId = await createSongStation(baseUrl, id);
    if (!stationId) return [];

    const url = buildApiUrl(baseUrl, 'webradio.getSong', {
      stationid: stationId,
      k: safeLimit,
      next: '1',
    });

    const { data } = await axios.get(url, {
      headers: { 'User-Agent': UA },
      timeout: 20000,
    });

    if (!data || data.error) return [];

    const songs = extractSuggestionSongs(data, baseUrl, id, safeLimit);
    if (songs.length > 0) {
      setCachedSongs(cacheKey, songs);
    }
    return songs;
  } catch {
    return [];
  }
}
