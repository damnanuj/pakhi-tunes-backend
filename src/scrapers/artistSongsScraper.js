import axios from 'axios';
import { scrapeTopArtists } from './topArtistsScraper.js';
import { formatSong } from '../utils/songFormatter.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const TOP_SONGS_COUNT = 50;

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

  const songList = Array.isArray(songs) ? songs : [];

  // Sort by play count to ensure consistent popularity order across regions
  songList.sort((a, b) => {
    const aCount = parseInt(a.play_count, 10) || 0;
    const bCount = parseInt(b.play_count, 10) || 0;
    return bCount - aCount;
  });

  return { songs: songList, total };
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

export async function scrapeArtistSongs(artistId, limit = 20, offset = 0) {
  const baseUrl = process.env.SCRAPER_SOURCE_BASE_URL;
  if (!baseUrl || !artistId) return { songs: [], total: 0 };

  const numericId = await resolveNumericId(baseUrl, String(artistId));
  if (!numericId) return { songs: [], total: 0 };

  const safeLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 20));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  const artistPage = await fetchArtistPageDetails(baseUrl, numericId);
  const topSongs = artistPage.songs;
  const total = artistPage.total;

  let rawSongs;

  if (safeOffset < topSongs.length) {
    const fromTop = topSongs.slice(safeOffset, safeOffset + safeLimit);
    const remaining = safeLimit - fromTop.length;

    if (remaining <= 0) {
      rawSongs = fromTop;
    } else {
      const morePage = Math.ceil(remaining / TOP_SONGS_COUNT);
      let moreSongs = [];
      for (let p = 1; p <= morePage; p++) {
        try {
          const result = await fetchArtistMoreSongs(baseUrl, numericId, p);
          moreSongs.push(...result.songs);
        } catch {}
      }
      rawSongs = [...fromTop, ...moreSongs.slice(0, remaining)];
    }
  } else {
    const extraOffset = safeOffset - topSongs.length;
    const startPage = Math.floor(extraOffset / TOP_SONGS_COUNT) + 1;
    const endPage = Math.ceil((extraOffset + safeLimit) / TOP_SONGS_COUNT);

    let moreSongs = [];
    for (let p = startPage; p <= endPage; p++) {
      try {
        const result = await fetchArtistMoreSongs(baseUrl, numericId, p);
        moreSongs.push(...result.songs);
      } catch {}
    }

    const localOffset = extraOffset - (startPage - 1) * TOP_SONGS_COUNT;
    rawSongs = moreSongs.slice(localOffset, localOffset + safeLimit);
  }

  const enriched = await enrichSongsWithDetails(baseUrl, rawSongs);

  // Sort by play count after enrichment for accurate ordering
  enriched.sort((a, b) => {
    const aCount = parseInt(a.play_count, 10) || 0;
    const bCount = parseInt(b.play_count, 10) || 0;
    return bCount - aCount;
  });

  const songs = enriched.map((s) => formatSong(s, baseUrl)).filter(Boolean);

  return { songs, total };
}
