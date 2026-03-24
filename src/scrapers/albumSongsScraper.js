import axios from 'axios';
import { formatSong, formatAlbumDetail } from '../utils/songFormatter.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

function normalizeAlbumIdInput(raw) {
  const input = String(raw ?? '').trim();
  if (!input) return '';
  if (input.startsWith('http')) {
    try {
      const u = new URL(input);
      const m = u.pathname.match(/\/album\/[^/]+\/([^/?]+)/);
      if (m?.[1]) return m[1];
    } catch {
      return input;
    }
  }
  return input;
}

async function fetchAlbumPayload(baseUrl, albumId) {
  const isNumeric = /^\d+$/.test(albumId);

  if (isNumeric) {
    try {
      const url = buildApiUrl(baseUrl, 'content.getAlbumDetails', { albumid: albumId });
      const { data } = await axios.get(url, {
        headers: { 'User-Agent': UA },
        timeout: 20000,
      });
      if (data?.id && Array.isArray(data.list)) return data;
    } catch {
      /* fall through to webapi */
    }
  }

  try {
    const url = buildApiUrl(baseUrl, 'webapi.get', { type: 'album', token: albumId });
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': UA },
      timeout: 20000,
    });
    if (data?.id && Array.isArray(data.list)) return data;
  } catch {
    return null;
  }
  return null;
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
    const detailedArr = Array.isArray(detailed) ? detailed : typeof detailed === 'object' ? Object.values(detailed) : [];

    const byId = new Map();
    for (const s of detailedArr) {
      if (s?.id) byId.set(s.id, s);
    }

    return songs.map((s) => byId.get(s.id) ?? s);
  } catch {
    return songs;
  }
}

export async function scrapeAlbumSongs(albumId, limit = 20, offset = 0) {
  const baseUrl = process.env.SCRAPER_SOURCE_BASE_URL;
  if (!baseUrl || !albumId) return { album: null, songs: [], total: 0 };

  const normalized = normalizeAlbumIdInput(albumId);
  if (!normalized) return { album: null, songs: [], total: 0 };

  let raw;
  try {
    raw = await fetchAlbumPayload(baseUrl, normalized);
  } catch {
    return { album: null, songs: [], total: 0 };
  }

  if (!raw) return { album: null, songs: [], total: 0 };

  const album = formatAlbumDetail(raw, baseUrl);
  const list = Array.isArray(raw.list) ? raw.list : [];
  const total = list.length;

  const safeLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 20));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  const pageSlice = list.slice(safeOffset, safeOffset + safeLimit);
  const enriched = await enrichSongsWithDetails(baseUrl, pageSlice);
  const songs = enriched.map((s) => formatSong(s, baseUrl)).filter(Boolean);

  return { album, songs, total };
}
