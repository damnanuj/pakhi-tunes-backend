import axios from 'axios';
import { formatSong, formatBrowseAlbum } from '../utils/songFormatter.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function sanitizeJsonString(str) {
  return str
    .replace(/new\s+Date\s*\([^)]*\)/g, 'null')
    .replace(/\bundefined\b/g, 'null');
}

function extractInitialData(html) {
  const match = html.match(/window\.__INITIAL_DATA__\s*=\s*\{/);
  if (!match) return null;

  const start = match.index + match[0].length - 1;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < html.length; i++) {
    if (escape) {
      escape = false;
      continue;
    }
    const c = html[i];
    if (inString) {
      if (c === '\\') escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(sanitizeJsonString(html.slice(start, i + 1)));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
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

function normalizeLanguage(language) {
  const raw = String(language ?? '')
    .trim()
    .toLowerCase();
  if (!raw) return '';
  return raw.replace(/[^a-z0-9-]/g, '');
}

function buildPagePath(language) {
  const lang = normalizeLanguage(language);
  if (!lang) return '/new-releases';
  return `/new-releases/${lang}`;
}

/**
 * Slugs for language-specific new-release paths: /new-releases/{slug}.
 * Pass any of these as the API `language` query param.
 */
export const NEW_RELEASE_LANGUAGE_SLUGS = [
  'hindi',
  'english',
  'tamil',
  'telugu',
  'punjabi',
  'marathi',
  'gujarati',
  'bengali',
  'kannada',
  'bhojpuri',
  'malayalam',
  'sanskrit',
  'haryanvi',
  'rajasthani',
  'odia',
  'assamese',
];

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

function mapBrowseListToResults(browseList, baseUrl, rawSongs) {
  const songById = new Map(rawSongs.map((s) => [s.id, s]));
  const out = [];

  for (const item of browseList) {
    if (!item?.type) continue;

    if (item.type === 'song') {
      const raw = songById.get(item.id) ?? item;
      const formatted = formatSong(raw, baseUrl);
      if (formatted) out.push(formatted);
      continue;
    }

    if (item.type === 'album') {
      const formatted = formatBrowseAlbum(item, baseUrl);
      if (formatted) out.push(formatted);
    }
  }

  return out;
}

/**
 * Fetches the new-releases browse page (HTML embed). The site typically ships one batch (~30 rows)
 * per request; extra rows load in the browser via internal calls we cannot mirror reliably, so
 * pagination applies to that batch only.
 */
export async function scrapeNewReleases(language = '', limit = 20, offset = 0) {
  const baseUrl = process.env.SCRAPER_SOURCE_BASE_URL;
  if (!baseUrl) {
    return {
      results: [],
      total: 0,
      meta: buildMeta(language, '', {}),
    };
  }

  const path = buildPagePath(language);
  const pageUrl = `${baseUrl.replace(/\/$/, '')}${path}`;

  const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  const { data: html } = await axios.get(pageUrl, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 20000,
    responseType: 'text',
  });

  const initial = extractInitialData(html);
  const browse = initial?.browse ?? {};
  const browseList = Array.isArray(browse.browse_list) ? browse.browse_list : [];

  const songRows = browseList.filter((i) => i?.type === 'song');
  const enriched = await enrichSongsWithDetails(baseUrl, songRows);
  const allResults = mapBrowseListToResults(browseList, baseUrl, enriched);

  const total = allResults.length;
  const results = allResults.slice(safeOffset, safeOffset + safeLimit);

  const meta = buildMeta(language, pageUrl, browse);

  return { results, total, meta };
}

function buildMeta(requestedLanguage, pageUrl, browse) {
  const slug = normalizeLanguage(requestedLanguage);
  return {
    language: slug || null,
    pageUrl,
    supportedLanguages: NEW_RELEASE_LANGUAGE_SLUGS,
    browseLanguage: browse.current_language || null,
    currentPageKey: browse.current_page ?? null,
  };
}
