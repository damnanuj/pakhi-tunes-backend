import axios from 'axios';
import { formatBrowseAlbum } from '../utils/songFormatter.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SUGGESTIONS_CACHE_TTL_MS = 3 * 60 * 1000;
const MAX_SUGGESTIONS_CACHE_ENTRIES = 100;
const MAX_ROW_ITEMS = 12;

/** @type {Map<string, { expiresAt: number, albums: object[], artists: object[] }>} */
const suggestionsCache = new Map();

function buildApiUrl(baseUrl, call, params) {
  const url = new URL(`${baseUrl}/api.php`);
  url.searchParams.set('__call', call);
  url.searchParams.set('_format', 'json');
  url.searchParams.set('_marker', '0');
  url.searchParams.set('api_version', '4');
  url.searchParams.set('ctx', 'web6dot0');
  url.searchParams.set('cc', 'in');
  url.searchParams.set('includeMetaTags', '1');
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function decodeHtml(text) {
  return String(text ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function resolveUrl(path, baseUrl) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

function normalizeCacheKey(query) {
  return String(query ?? '').trim().toLowerCase();
}

function getCachedSuggestions(cacheKey) {
  const entry = suggestionsCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    suggestionsCache.delete(cacheKey);
    return null;
  }
  return entry;
}

function setCachedSuggestions(cacheKey, albums, artists) {
  if (suggestionsCache.size >= MAX_SUGGESTIONS_CACHE_ENTRIES) {
    const oldestKey = suggestionsCache.keys().next().value;
    if (oldestKey) suggestionsCache.delete(oldestKey);
  }
  suggestionsCache.set(cacheKey, {
    albums,
    artists,
    expiresAt: Date.now() + SUGGESTIONS_CACHE_TTL_MS,
  });
}

function extractCategoryList(category) {
  if (!category) return [];
  if (Array.isArray(category)) return category;
  if (Array.isArray(category.data)) return category.data;
  if (Array.isArray(category.results)) return category.results;
  return [];
}

function formatSearchAlbumItem(item, baseUrl) {
  if (!item?.id) return null;

  const mapped = {
    ...item,
    type: 'album',
    perma_url: item.perma_url ?? item.url ?? null,
    title: item.title ?? item.name ?? '',
  };

  const album = formatBrowseAlbum(mapped, baseUrl);
  if (!album) return null;

  return {
    ...album,
    name: decodeHtml(album.name),
  };
}

function formatSearchArtistItem(item, baseUrl) {
  if (!item?.id) return null;

  const rawUrl = item.perma_url ?? item.url ?? '';
  const fullUrl =
    typeof rawUrl === 'string' && rawUrl.startsWith('http')
      ? rawUrl
      : resolveUrl(rawUrl, baseUrl);
  const encrypted_id = fullUrl?.match(/\/artist\/[^/]+\/([^/?]+)/)?.[1] ?? String(item.id);

  let name = item.title?.text ?? (typeof item.title === 'string' ? item.title : '') ?? item.name ?? '';
  name = decodeHtml(name);

  let image = '';
  if (typeof item.image === 'string') {
    image = item.image.replace(/^http:\/\//, 'https://');
  } else if (Array.isArray(item.image)) {
    image = item.image[0]?.url?.replace(/^http:\/\//, 'https://') ?? '';
  } else if (item.image?.url) {
    image = String(item.image.url).replace(/^http:\/\//, 'https://');
  }

  return {
    id: String(item.id),
    encrypted_id,
    name,
    image,
    type: 'artist',
  };
}

/**
 * Mixed catalog suggestions: albums and artists for a search query.
 * Uses autocomplete.get — same strategy as public search suggestion UI.
 */
export async function fetchCatalogSuggestions(baseUrl, query) {
  const q = String(query ?? '').trim();
  if (!baseUrl || !q) {
    return { albums: [], artists: [] };
  }

  const cacheKey = normalizeCacheKey(q);
  const cached = getCachedSuggestions(cacheKey);
  if (cached) {
    return { albums: cached.albums, artists: cached.artists };
  }

  const url = buildApiUrl(baseUrl, 'autocomplete.get', { query: q });

  const { data } = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 20000,
  });

  if (data?.error) {
    return { albums: [], artists: [] };
  }

  const rawAlbums = extractCategoryList(data?.albums);
  const rawArtists = extractCategoryList(data?.artists);

  const albums = rawAlbums
    .map((item) => formatSearchAlbumItem(item, baseUrl))
    .filter(Boolean)
    .slice(0, MAX_ROW_ITEMS);

  const artists = rawArtists
    .map((item) => formatSearchArtistItem(item, baseUrl))
    .filter((item) => item?.id && item?.name)
    .slice(0, MAX_ROW_ITEMS);

  setCachedSuggestions(cacheKey, albums, artists);

  return { albums, artists };
}
