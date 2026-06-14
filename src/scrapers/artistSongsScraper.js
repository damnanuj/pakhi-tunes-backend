import axios from 'axios';
import { scrapeTopArtists } from './topArtistsScraper.js';
import { formatSong } from '../utils/songFormatter.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const TOP_SONGS_COUNT = 50;
const MAX_MORE_PAGES = 120;

function formatArtist(data) {
  if (!data) return null;

  const permaUrl = data.urls?.overview ?? data.perma_url ?? '';
  const encrypted_id = permaUrl?.match(/\/artist\/[^/]+\/([^/?]+)/)?.[1] ?? null;

  const imageArr = data.image ?? [];
  const images = (Array.isArray(imageArr) ? imageArr : [imageArr])
    .filter(Boolean)
    .map((url) => {
      const u = typeof url === 'string' ? url : '';
      const q = u.includes('150x150') ? '150x150' : u.includes('50x50') ? '50x50' : '500x500';
      return { quality: q, url: u };
    });

  return {
    id: data.artistId ?? data.id ?? null,
    encrypted_id,
    name: data.name ?? data.title?.text ?? null,
    url: permaUrl || null,
    image: images,
    fanCount: Number(data.fan_count) || null,
    followerCount: Number(data.follower_count) || null,
    dob: data.dob || null,
    isVerified: data.isVerified ?? data.is_verified ?? false,
    dominantLanguage: data.dominantLanguage ?? null,
    dominantType: data.dominantType ?? null,
    bio: Array.isArray(data.bio) ? data.bio.map((b) => ({ text: b.text ?? '', title: b.title ?? '' })) : [],
    wiki: data.wiki || null,
  };
}

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

async function resolveNumericId(baseUrl, artistId) {
  if (/^\d+$/.test(artistId)) return artistId;

  const artists = await scrapeTopArtists();
  const match = artists.find((a) => a.encrypted_id === artistId);
  if (match?.id) return match.id;

  try {
    const url = buildApiUrl(baseUrl, 'webapi.get', { type: 'artist', token: artistId });
    const { data } = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 10000 });
    const numericId = data?.artistId ?? data?.id;
    if (numericId) return String(numericId);
  } catch {}

  return null;
}

async function fetchArtistPageDetails(baseUrl, artistId) {
  const url = buildApiUrl(baseUrl, 'artist.getArtistPageDetails', {
    artistId,
    n_song: TOP_SONGS_COUNT,
    n_album: 0,
    page: 0,
    category: 'popularity',
    sort_order: 'desc',
  });

  const { data } = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 15000,
  });

  const songs = data?.topSongs ?? [];
  const artist = formatArtist(data);

  let total = 0;
  try {
    const moreUrl = buildApiUrl(baseUrl, 'artist.getArtistMoreSong', {
      artistId,
      page: 1,
      category: 'popularity',
      sort_order: 'desc',
    });
    const { data: moreData } = await axios.get(moreUrl, {
      headers: { 'User-Agent': UA },
      timeout: 10000,
    });
    total = Number(moreData?.topSongs?.total) || 0;
  } catch {}

  if (!total) total = songs.length;

  return {
    artist,
    songs: Array.isArray(songs) ? songs : [],
    total,
  };
}

async function fetchArtistMoreSongs(baseUrl, artistId, page = 1) {
  const url = buildApiUrl(baseUrl, 'artist.getArtistMoreSong', {
    artistId,
    page,
    category: 'popularity',
    sort_order: 'desc',
  });

  const { data } = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 15000,
  });

  const songs = data?.topSongs?.songs ?? [];
  const total = data?.topSongs?.total ?? 0;

  return {
    songs: Array.isArray(songs) ? songs : [],
    total: Number(total) || 0,
  };
}

async function enrichSongsWithDetails(baseUrl, songs) {
  const ids = songs.map((s) => s.id).filter(Boolean);
  if (!ids.length) return songs;

  try {
    const url = buildApiUrl(baseUrl, 'song.getDetails', { pids: ids.join(',') });
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': UA },
      timeout: 15000,
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

/**
 * Build a deduped global song catalog: top songs first, then unique songs
 * from paginated getArtistMoreSong until `targetCount` items are collected.
 */
async function buildArtistSongCatalog(baseUrl, numericId, topSongs, targetCount) {
  const catalog = [];
  const seen = new Set();

  for (const song of topSongs) {
    if (!song?.id || seen.has(song.id)) continue;
    seen.add(song.id);
    catalog.push(song);
    if (catalog.length >= targetCount) return catalog;
  }

  let page = 1;
  while (catalog.length < targetCount && page <= MAX_MORE_PAGES) {
    let batch;
    try {
      batch = await fetchArtistMoreSongs(baseUrl, numericId, page);
    } catch {
      break;
    }

    const songs = batch.songs ?? [];
    if (!songs.length) break;

    for (const song of songs) {
      if (!song?.id || seen.has(song.id)) continue;
      seen.add(song.id);
      catalog.push(song);
      if (catalog.length >= targetCount) break;
    }

    page += 1;
  }

  return catalog;
}

async function sliceArtistSongs(baseUrl, numericId, topSongs, offset, limit) {
  const targetCount = offset + limit;
  const catalog = await buildArtistSongCatalog(
    baseUrl,
    numericId,
    topSongs,
    targetCount
  );
  return catalog.slice(offset, offset + limit);
}

export async function scrapeArtistSongs(artistId, limit = 20, offset = 0) {
  const baseUrl = process.env.SCRAPER_SOURCE_BASE_URL;
  if (!baseUrl || !artistId) return { artist: null, songs: [], total: 0 };

  const numericId = await resolveNumericId(baseUrl, String(artistId));
  if (!numericId) return { artist: null, songs: [], total: 0 };

  const safeLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 20));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  const artistPage = await fetchArtistPageDetails(baseUrl, numericId);
  const { artist } = artistPage;
  const topSongs = artistPage.songs;
  const total = artistPage.total;

  const rawSongs = await sliceArtistSongs(
    baseUrl,
    numericId,
    topSongs,
    safeOffset,
    safeLimit
  );

  const enriched = await enrichSongsWithDetails(baseUrl, rawSongs);
  const songs = enriched.map((s) => formatSong(s, baseUrl)).filter(Boolean);

  return { artist, songs, total };
}
