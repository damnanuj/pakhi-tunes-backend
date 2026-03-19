import axios from 'axios';
import * as cheerio from 'cheerio';

const WINDOW_VAR_PATTERNS = [
  '__INITIAL_DATA__',
  '__INITIAL_STATE__',
  '__STATE__',
  '__PRELOADED_STATE__',
  '__REDUX_STATE__',
  '__APP_STATE__',
  '__HYDRATION_DATA__',
  '__DATA__',
];

function extractJsonObject(str, startIndex) {
  if (str[startIndex] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let quoteChar = null;

  for (let i = startIndex; i < str.length; i++) {
    const c = str[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (!inString) {
      if (c === '"' || c === "'") {
        inString = true;
        quoteChar = c;
        continue;
      }
      if (c === '{') {
        depth++;
        continue;
      }
      if (c === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(str.slice(startIndex, i + 1));
          } catch {
            return null;
          }
        }
      }
      continue;
    }
    if (c === quoteChar) inString = false;
  }
  return null;
}

function extractFromWindowVars(html) {
  for (const varName of WINDOW_VAR_PATTERNS) {
    const pattern = new RegExp(
      `window\\.${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*`,
      'i'
    );
    const match = html.match(pattern);
    if (match) {
      const startIndex = match.index + match[0].length;
      const obj = extractJsonObject(html, startIndex);
      if (obj) {
        const list = obj?.browse?.browse_list ?? obj?.browse_list;
        if (Array.isArray(list)) {
          return mapToArtists(list);
        }
      }
    }
  }

  const browseListMatch = html.match(/"browse_list"\s*:\s*\[/);
  if (browseListMatch) {
    const arrayStart = html.indexOf('[', browseListMatch.index);
    let depth = 0;
    for (let i = arrayStart; i < html.length; i++) {
      const c = html[i];
      if (c === '[') depth++;
      else if (c === ']') {
        depth--;
        if (depth === 0) {
          try {
            const arr = JSON.parse(html.slice(arrayStart, i + 1));
            return mapToArtists(arr);
          } catch {
            break;
          }
        }
      }
    }
  }

  return null;
}

async function fetchFromApi(baseUrl) {
  const endpoints = [
    `${baseUrl}/api.php?_format=json&_marker=0&ctx=web6dot0&api_version=4&__call=webapi.get&type=page&token=top-artists`,
    `${baseUrl}/api.php?__call=content.getTopArtists`,
  ];

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json',
  };

  for (const url of endpoints) {
    try {
      const { data } = await axios.get(url, { headers, timeout: 10000 });
      const list = data?.browse_list ?? data?.data?.browse_list ?? data?.results;
      if (Array.isArray(list)) {
        return mapToArtists(list);
      }
      if (data?.browse?.browse_list) {
        return mapToArtists(data.browse.browse_list);
      }
    } catch {
      continue;
    }
  }
  return null;
}

function extractFromHtml(html, baseUrl) {
  const $ = cheerio.load(html);
  const artists = [];

  $('a[href*="/artist/"]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') || '';
    const idMatch = href.match(/\/artist\/[^/]+\/([^/?]+)/);
    const encryptedId = idMatch ? idMatch[1] : null;

    const name =
      $el.find('[class*="title"]').first().text().trim() ||
      $el.find('span').first().text().trim() ||
      $el.text().trim().split('\n')[0]?.trim() ||
      '';

    const subtitleEl = $el.find('[class*="subtitle"]').first();
    const fansText = subtitleEl.text().trim() || null;

    const img = $el.find('img').first();
    const image = img.attr('src') || img.attr('data-src') || null;

    if (encryptedId && name) {
      const permaUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? href : '/' + href}`;
      artists.push({
        type: 'artist',
        id: encryptedId,
        encrypted_id: encryptedId,
        perma_url: permaUrl,
        name,
        fansText,
        image,
      });
    }
  });

  return deduplicateById(artists, 'encrypted_id');
}

function deduplicateById(artists, key = 'id') {
  const seen = new Set();
  return artists.filter((a) => {
    const k = a[key] ?? a.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function mapToArtists(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item?.type === 'artist' || item?.title)
    .map((item) => {
      const subtitleText = item.subtitle?.[0]?.text ?? '';

      return {
        type: item.type ?? 'artist',
        id: item.id?.toString() ?? item.encrypted_id ?? '',
        encrypted_id: item.encrypted_id ?? null,
        perma_url: item.perma_url ?? null,
        name: item.title?.text ?? item.title ?? '',
        fansText: subtitleText || null,
        image: Array.isArray(item.image) ? item.image[0] ?? null : item.image ?? null,
      };
    })
    .filter((a) => a.id && a.name);
}

export async function scrapeTopArtists() {
  const baseUrl = process.env.SCRAPER_SOURCE_BASE_URL;
  if (!baseUrl) return [];
  const url = `${baseUrl}/top-artists`;

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const { data: html } = await axios.get(url, {
    headers,
    timeout: 15000,
    responseType: 'text',
  });

  const fromWindow = extractFromWindowVars(html);
  if (fromWindow?.length) return fromWindow;

  const fromApi = await fetchFromApi(baseUrl);
  if (fromApi?.length) return fromApi;

  const fromHtml = extractFromHtml(html, baseUrl);
  if (fromHtml?.length) return fromHtml;

  return [];
}
