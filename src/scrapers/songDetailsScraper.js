import axios from 'axios';
import { formatSong } from '../utils/songFormatter.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function sanitizeJsonString(str) {
  return str
    .replace(/new\s+Date\s*\([^)]*\)/g, 'null')
    .replace(/\bundefined\b/g, 'null');
}

function extractSongFromHtml(html) {
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
          const data = JSON.parse(sanitizeJsonString(html.slice(start, i + 1)));
          return data?.song?.song ?? null;
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

export async function fetchSongByToken(baseUrl, idOrTokenOrUrl) {
  const input = String(idOrTokenOrUrl).trim();
  if (!input || !baseUrl) return null;

  if (input.startsWith('http')) {
    return fetchSongByPageUrl(input, baseUrl);
  }

  // Try song.getDetails first (works with internal IDs like aRZbUYD7)
  try {
    const url = buildApiUrl(baseUrl, 'song.getDetails', { pids: input });
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': UA },
      timeout: 15000,
    });

    const detailed = data?.songs ?? data;
    const arr = Array.isArray(detailed) ? detailed : typeof detailed === 'object' ? Object.values(detailed) : [];
    const raw = arr[0];
    if (raw?.id) return formatSong(raw, baseUrl);
  } catch {}

  // Fallback to webapi.get (works with URL tokens like EToxUyFpcwQ)
  try {
    const url = buildApiUrl(baseUrl, 'webapi.get', { type: 'song', token: input });
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': UA },
      timeout: 15000,
    });

    const songs = Array.isArray(data?.songs) ? data.songs : data?.songs ? Object.values(data.songs) : [];
    const raw = songs[0] ?? data;
    if (raw?.id) return formatSong(raw, baseUrl);
  } catch {}

  return null;
}

async function fetchSongByPageUrl(pageUrl, baseUrl) {
  try {
    const { data: html } = await axios.get(pageUrl, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
      responseType: 'text',
    });

    const raw = extractSongFromHtml(html);
    if (!raw) return null;

    const base = baseUrl || (() => {
      try { return new URL(pageUrl).origin; } catch { return ''; }
    })();

    return formatSong(raw, base);
  } catch {
    return null;
  }
}
