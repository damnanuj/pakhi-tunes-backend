import axios from 'axios';
import { formatSong } from '../utils/songFormatter.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MAX_PAGE_SIZE = 50;

function buildApiUrl(baseUrl, call, params) {
  const url = new URL(`${baseUrl}/api.php`);
  url.searchParams.set('__call', call);
  url.searchParams.set('_format', 'json');
  url.searchParams.set('_marker', '0');
  url.searchParams.set('api_version', '4');
  url.searchParams.set('ctx', 'web6dot0');
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** Song search via catalog `search.getResults`. */
export async function searchSongs(baseUrl, query, limit = 20, offset = 0) {
  const q = String(query ?? '').trim();
  if (!baseUrl || !q) {
    return { songs: [], total: 0 };
  }

  const safeLimit = Math.max(1, Math.min(MAX_PAGE_SIZE, parseInt(limit, 10) || 20));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
  const page = Math.floor(safeOffset / safeLimit) + 1;

  const url = buildApiUrl(baseUrl, 'search.getResults', {
    q,
    p: page,
    n: safeLimit,
  });

  const { data } = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 20000,
  });

  if (data?.error) {
    return { songs: [], total: 0 };
  }

  const rawList = Array.isArray(data?.results) ? data.results : [];
  const total = Number(data?.total) || rawList.length;

  const songs = rawList
    .filter((item) => item?.type === 'song' && item?.id)
    .map((item) => formatSong(item, baseUrl))
    .filter(Boolean);

  return { songs, total };
}
