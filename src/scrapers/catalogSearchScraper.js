import axios from 'axios';
import { formatBrowseAlbum } from '../utils/songFormatter.js';
import { searchSongs } from './songSearchScraper.js';
import {
  buildCatalogApiUrl,
  catalogImageLinks,
  CATALOG_UA,
  decodeCatalogHtml,
} from './catalogScraperShared.js';

const CACHE_TTL_MS = 3 * 60 * 1000;
const MAX_CACHE_ENTRIES = 80;
const SIDE_LIMIT = 6;
const TOP_LIMIT = 3;
const ALBUM_FETCH_LIMIT = 8;
const PLAYLIST_FETCH_LIMIT = 20;

/** @type {Map<string, { expiresAt: number, payload: object }>} */
const searchCache = new Map();

/** @type {Map<string, Promise<object>>} */
const inFlight = new Map();

function cleanLabel(text) {
  const value = decodeCatalogHtml(text);
  if (!value) return '';
  if (/saavn|jio/i.test(value)) return '';
  return value;
}

function capitalize(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function tokenFromUrl(url, section) {
  const match = String(url ?? '').match(new RegExp(`/${section}/[^/]+/([^/?]+)`));
  return match?.[1] ?? '';
}

function queryTokens(query) {
  return String(query ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function albumHaystack(item) {
  const title = typeof item?.title === 'string' ? item.title : item?.name ?? '';
  const music = item?.more_info?.music ?? '';
  return `${title} ${item?.subtitle ?? ''} ${music}`.toLowerCase();
}

function selectRanked(items, tokens, haystack, fallbackToAll) {
  const required = tokens.filter((token) => token.length >= 4);
  const usable = required.length ? required : tokens;
  if (!usable.length) return items;

  const ranked = items
    .map((item) => {
      const hay = haystack(item);
      const score = usable.filter((token) => hay.includes(token)).length;
      return { item, score };
    })
    .filter((entry) => entry.score > 0);

  if (!ranked.length) return fallbackToAll ? items : [];

  const hasFullMatch = ranked.some((entry) => entry.score === usable.length);
  const minScore = hasFullMatch
    ? usable.length
    : Math.max(...ranked.map((entry) => entry.score));

  return ranked.filter((entry) => entry.score >= minScore).map((entry) => entry.item);
}

function playlistHaystack(item) {
  const name = typeof item?.title === 'string' ? item.title : item?.name ?? '';
  const artists = Array.isArray(item?.more_info?.artist_name)
    ? item.more_info.artist_name.join(' ')
    : '';
  return `${name} ${item?.subtitle ?? ''} ${artists}`.toLowerCase();
}

function cacheGet(key) {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    searchCache.delete(key);
    return null;
  }
  return entry.payload;
}

function cacheSet(key, payload) {
  if (searchCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(key, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function fetchResults(baseUrl, call, query, limit) {
  const url = buildCatalogApiUrl(baseUrl, call, { q: query, p: 1, n: limit });
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': CATALOG_UA },
    timeout: 15000,
  });
  if (data?.error) return [];
  return Array.isArray(data?.results) ? data.results : [];
}

function formatAlbum(item, baseUrl) {
  const album = formatBrowseAlbum(
    { ...item, type: 'album', title: item.title ?? item.name ?? '' },
    baseUrl
  );
  if (!album) return null;

  const language = capitalize(item.language);
  const year = item.year ? String(item.year) : '';
  const music = cleanLabel(item.more_info?.music || item.subtitle);
  const kind = language ? `${language} Album` : 'Album';
  const subtitle = [kind, year, music].filter(Boolean).join(' · ');

  return {
    ...album,
    encrypted_id: album.encrypted_id ?? tokenFromUrl(item.perma_url, 'album'),
    name: decodeCatalogHtml(album.name),
    subtitle,
  };
}

function formatArtist(item) {
  const name = decodeCatalogHtml(typeof item?.name === 'string' ? item.name : item?.title);
  if (!item?.id || !name) return null;

  const encrypted_id = tokenFromUrl(item.perma_url, 'artist') || String(item.id);
  const subtitle = cleanLabel(item.role || item.extra || 'Artist') || 'Artist';

  return {
    id: String(item.id),
    encrypted_id,
    name,
    subtitle,
    image: catalogImageLinks(item.image),
    type: 'artist',
  };
}

function formatPlaylist(item) {
  const name = decodeCatalogHtml(typeof item?.title === 'string' ? item.title : item?.name);
  if (!item?.id || !name) return null;

  const count = Number(item.more_info?.song_count ?? item.list_count);
  const subtitle =
    Number.isFinite(count) && count > 0
      ? `${count} ${count === 1 ? 'Song' : 'Songs'}`
      : cleanLabel(item.subtitle);

  return {
    id: String(item.id),
    encrypted_id: tokenFromUrl(item.perma_url, 'featured') || String(item.id),
    name,
    subtitle,
    image: catalogImageLinks(item.image),
    type: 'playlist',
  };
}

function songSubtitle(song) {
  const artists = (song?.artists?.primary ?? [])
    .map((artist) => artist?.name)
    .filter(Boolean)
    .join(', ');
  return artists || song?.album?.name || '';
}

function buildTop(artists, songs) {
  const top = [];

  if (artists[0]) {
    const artist = artists[0];
    top.push({
      type: 'artist',
      id: artist.id,
      encrypted_id: artist.encrypted_id,
      name: artist.name,
      subtitle: artist.subtitle || 'Artist',
      image: artist.image,
    });
  }

  for (const song of songs) {
    if (top.length >= TOP_LIMIT) break;
    top.push({
      type: 'song',
      id: song.id,
      encrypted_id: song.encrypted_id ?? '',
      name: song.name,
      subtitle: songSubtitle(song),
      image: song.image ?? [],
    });
  }

  return top;
}

async function searchCatalogUncached(baseUrl, query, limit, offset) {
  const q = String(query ?? '').trim();
  const safeLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 20));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  if (safeOffset > 0) {
    const { songs, total } = await searchSongs(baseUrl, q, safeLimit, safeOffset);
    return { songs, total, top: [], albums: [], artists: [], playlists: [] };
  }

  const tokens = queryTokens(q);
  const [songsResult, albumsResult, artistsResult, playlistsResult] = await Promise.allSettled([
    searchSongs(baseUrl, q, safeLimit, 0),
    fetchResults(baseUrl, 'search.getAlbumResults', q, ALBUM_FETCH_LIMIT),
    fetchResults(baseUrl, 'search.getArtistResults', q, SIDE_LIMIT),
    fetchResults(baseUrl, 'search.getPlaylistResults', q, PLAYLIST_FETCH_LIMIT),
  ]);

  if (
    songsResult.status === 'rejected' &&
    albumsResult.status === 'rejected' &&
    artistsResult.status === 'rejected' &&
    playlistsResult.status === 'rejected'
  ) {
    throw songsResult.reason ?? new Error('Search unavailable');
  }

  const songs = songsResult.status === 'fulfilled' ? songsResult.value.songs ?? [] : [];
  const total = songsResult.status === 'fulfilled' ? songsResult.value.total ?? songs.length : 0;

  const albums =
    albumsResult.status === 'fulfilled'
      ? selectRanked(albumsResult.value, tokens, albumHaystack, true)
          .map((item) => formatAlbum(item, baseUrl))
          .filter((item) => item?.id && item?.name)
          .slice(0, SIDE_LIMIT)
      : [];

  const artists =
    artistsResult.status === 'fulfilled'
      ? artistsResult.value.map(formatArtist).filter(Boolean).slice(0, SIDE_LIMIT)
      : [];

  const playlists =
    playlistsResult.status === 'fulfilled'
      ? selectRanked(playlistsResult.value, tokens, playlistHaystack, false)
          .map((item) => formatPlaylist(item))
          .filter(Boolean)
          .slice(0, SIDE_LIMIT)
      : [];

  return {
    songs,
    total,
    top: buildTop(artists, songs),
    albums,
    artists,
    playlists,
  };
}

/**
 * Grouped search: playable songs plus albums, artists, and playlists.
 * First page only. Later pages are songs.
 */
export async function searchCatalog(baseUrl, query, limit = 20, offset = 0) {
  const q = String(query ?? '').trim();
  const safeLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 20));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  if (!baseUrl || !q) {
    return { songs: [], total: 0, top: [], albums: [], artists: [], playlists: [] };
  }

  const cacheKey = `${q.toLowerCase()}|${safeLimit}|${safeOffset}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  let pending = inFlight.get(cacheKey);
  if (!pending) {
    pending = searchCatalogUncached(baseUrl, q, safeLimit, safeOffset)
      .then((payload) => {
        cacheSet(cacheKey, payload);
        return payload;
      })
      .finally(() => {
        inFlight.delete(cacheKey);
      });
    inFlight.set(cacheKey, pending);
  }

  return pending;
}
