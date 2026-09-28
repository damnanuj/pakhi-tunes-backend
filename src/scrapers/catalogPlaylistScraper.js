import axios from 'axios';
import { formatSong } from '../utils/songFormatter.js';
import {
  buildCatalogApiUrl,
  catalogImageLinks,
  CATALOG_UA,
  decodeCatalogHtml,
} from './catalogScraperShared.js';

const PLAYLIST_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_PLAYLIST_CACHE_ENTRIES = 40;

/** @type {Map<string, { expiresAt: number, meta: object, list: object[] }>} */
const playlistListCache = new Map();

function playlistTitle(data) {
  if (typeof data?.title === 'string') return decodeCatalogHtml(data.title);
  if (typeof data?.title?.text === 'string') return decodeCatalogHtml(data.title.text);
  if (typeof data?.listname === 'string') return decodeCatalogHtml(data.listname);
  if (typeof data?.name === 'string') return decodeCatalogHtml(data.name);
  return '';
}

function normalizeSongList(rawList) {
  const list = Array.isArray(rawList) ? rawList : [];
  return list.filter((item) => item?.id && (item.type === 'song' || item.type == null));
}

async function enrichSongs(baseUrl, songs) {
  const ids = songs.map((song) => song?.id).filter(Boolean);
  if (!ids.length) return songs;

  try {
    const url = buildCatalogApiUrl(baseUrl, 'song.getDetails', { pids: ids.join(',') });
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': CATALOG_UA },
      timeout: 20000,
    });
    const detailed = data?.songs ?? data;
    const detailedArr = Array.isArray(detailed)
      ? detailed
      : detailed && typeof detailed === 'object'
        ? Object.values(detailed)
        : [];
    const byId = new Map();
    for (const song of detailedArr) {
      if (song?.id) byId.set(String(song.id), song);
    }
    return songs.map((song) => byId.get(String(song.id)) ?? song);
  } catch {
    return songs;
  }
}

async function loadPlaylistEntry(baseUrl, id) {
  const cached = playlistListCache.get(id);
  if (cached && Date.now() < cached.expiresAt) {
    return cached;
  }

  const url = buildCatalogApiUrl(baseUrl, 'playlist.getDetails', { listid: id });
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': CATALOG_UA },
    timeout: 20000,
  });

  const name = playlistTitle(data);
  const list = normalizeSongList(data?.list ?? data?.songs);

  if (!name && list.length === 0) {
    return null;
  }

  const meta = {
    id,
    name: name || 'Playlist',
    image: catalogImageLinks(data?.image),
    songCount: list.length,
  };

  const entry = {
    expiresAt: Date.now() + PLAYLIST_CACHE_TTL_MS,
    meta,
    list,
  };

  if (playlistListCache.size >= MAX_PLAYLIST_CACHE_ENTRIES) {
    const oldestKey = playlistListCache.keys().next().value;
    if (oldestKey) playlistListCache.delete(oldestKey);
  }
  playlistListCache.set(id, entry);
  return entry;
}

export async function scrapeCatalogPlaylist(playlistId, limit = 20, offset = 0) {
  const baseUrl = process.env.SCRAPER_SOURCE_BASE_URL;
  const id = String(playlistId ?? '').trim();
  if (!baseUrl || !/^\d+$/.test(id)) {
    return { playlist: null, songs: [], total: 0 };
  }

  const entry = await loadPlaylistEntry(baseUrl, id);
  if (!entry) {
    return { playlist: null, songs: [], total: 0 };
  }

  const { meta, list } = entry;
  const songCount = list.length;
  const playlist = {
    id: meta.id,
    name: meta.name,
    subtitle: songCount > 0 ? `${songCount} ${songCount === 1 ? 'Song' : 'Songs'}` : '',
    image: meta.image,
    songCount,
    type: 'playlist',
  };

  const safeLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 20));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
  const pageSlice = list.slice(safeOffset, safeOffset + safeLimit);
  const enriched = await enrichSongs(baseUrl, pageSlice);
  const songs = enriched.map((song) => formatSong(song, baseUrl)).filter(Boolean);

  return { playlist, songs, total: songCount };
}
