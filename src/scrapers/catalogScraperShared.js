export const CATALOG_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function buildCatalogApiUrl(baseUrl, call, params) {
  const url = new URL(`${baseUrl}/api.php`);
  url.searchParams.set('__call', call);
  url.searchParams.set('_format', 'json');
  url.searchParams.set('_marker', '0');
  url.searchParams.set('api_version', '4');
  url.searchParams.set('ctx', 'web6dot0');
  url.searchParams.set('cc', 'in');
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export function decodeCatalogHtml(text) {
  return String(text ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function catalogImageLinks(input) {
  const raw = Array.isArray(input) ? input[0] : input;
  const url = typeof raw === 'string' ? raw : raw?.url ?? '';
  if (!url) return [];
  const https = url.replace(/^http:\/\//, 'https://');
  return ['50x50', '150x150', '500x500'].map((quality) => ({
    quality,
    url: https.replace(/50x50|150x150|500x500/, quality),
  }));
}
