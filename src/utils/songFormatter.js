import forge from 'node-forge';

const IMAGE_QUALITIES = ['50x50', '150x150', '500x500'];
const DOWNLOAD_QUALITIES = [
  { id: '_12', bitrate: '12kbps' },
  { id: '_48', bitrate: '48kbps' },
  { id: '_96', bitrate: '96kbps' },
  { id: '_160', bitrate: '160kbps' },
  { id: '_320', bitrate: '320kbps' },
];
const DECRYPT_KEY = '38346591';
const DECRYPT_IV = '00000000';

function createImageLinks(input) {
  const raw = Array.isArray(input) ? input[0] : input;
  const url = typeof raw === 'string' ? raw : raw?.url ?? '';
  if (!url) return [];
  return IMAGE_QUALITIES.map((q) => ({
    quality: q,
    url: url.replace(/150x150|50x50|500x500/, q).replace(/^http:\/\//, 'https://'),
  }));
}

function createDownloadLinks(encryptedMediaUrl) {
  if (!encryptedMediaUrl) return [];
  try {
    const encrypted = forge.util.decode64(encryptedMediaUrl);
    const decipher = forge.cipher.createDecipher('DES-ECB', forge.util.createBuffer(DECRYPT_KEY));
    decipher.start({ iv: forge.util.createBuffer(DECRYPT_IV) });
    decipher.update(forge.util.createBuffer(encrypted));
    decipher.finish();
    const decrypted = decipher.output.getBytes();
    return DOWNLOAD_QUALITIES.map(({ id, bitrate }) => ({
      quality: bitrate,
      url: decrypted.replace('_96', id),
    }));
  } catch {
    return [];
  }
}

function resolveUrl(path, baseUrl) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

function mapArtist(a, baseUrl) {
  if (!a?.id) return null;
  return {
    id: a.id,
    name: a.name ?? '',
    role: a.role ?? null,
    image: createImageLinks(a.image),
    type: a.type ?? 'artist',
    url: resolveUrl(a.perma_url ?? a.url, baseUrl),
  };
}

export function formatSong(song, baseUrl = '') {
  if (!song?.id) return null;

  const more = song.more_info ?? {};

  const name = song.song ?? song.title?.text ?? (typeof song.title === 'string' ? song.title : '') ?? '';

  const albumText = typeof song.album === 'string' ? song.album : song.album?.text ?? more.album ?? '';
  const albumAction = song.album?.action ?? more.album_url ?? '';
  const albumId = more.album_id ?? albumAction.match?.(/\/([^/]+)$/)?.[1] ?? null;
  const albumUrl = resolveUrl(albumAction, baseUrl);

  const rawArtists = Array.isArray(song.artists) ? song.artists : [];
  const artistMap = more.artistMap ?? {};
  let primary, featured, all;

  if (artistMap.primary_artists?.length || artistMap.artists?.length) {
    primary = (artistMap.primary_artists ?? []).map((a) => mapArtist(a, baseUrl)).filter(Boolean);
    featured = (artistMap.featured_artists ?? []).map((a) => mapArtist(a, baseUrl)).filter(Boolean);
    all = (artistMap.artists ?? []).map((a) => mapArtist(a, baseUrl)).filter(Boolean);
  } else if (rawArtists.length) {
    all = rawArtists.map((a) => mapArtist(a, baseUrl)).filter(Boolean);
    primary = all.filter((a) => ['singer', 'primary_artists', 'music'].includes(a.role));
    if (!primary.length) primary = all.slice(0, 2);
    featured = [];
  } else {
    primary = [];
    featured = [];
    all = [];
  }

  const encryptedUrl = song.encrypted_media_url ?? more.encrypted_media_url ?? null;
  const copyrightText = typeof song.copyright === 'string' ? song.copyright : song.copyright?.text ?? more.copyright_text ?? null;
  const permaUrl = song.perma_url ?? (song.title?.action ? resolveUrl(song.title.action, baseUrl) : null);
  const duration = typeof song.duration === 'number' ? song.duration : more.duration ? parseInt(more.duration, 10) : null;

  const fullUrl = typeof permaUrl === 'string' && permaUrl.startsWith('http') ? permaUrl : resolveUrl(permaUrl, baseUrl);
  const encrypted_id = fullUrl?.match(/\/song\/[^/]+\/([^/?]+)/)?.[1] ?? null;

  return {
    id: song.id,
    encrypted_id,
    name,
    type: song.type ?? 'song',
    year: song.year ?? null,
    releaseDate: more.release_date ?? null,
    duration,
    label: more.label ?? null,
    explicitContent: song.explicit_content === '1',
    playCount: song.play_count != null ? Number(song.play_count) : null,
    language: song.language ?? null,
    hasLyrics: song.has_lyrics === true || more.has_lyrics === 'true',
    lyricsId: more.lyrics_id ?? null,
    lyrics: song.lyrics?.content ?? null,
    url: fullUrl,
    copyright: copyrightText,
    album: { id: albumId, name: albumText || null, url: albumUrl },
    artists: { primary, featured, all },
    image: createImageLinks(song.image),
    downloadUrl: createDownloadLinks(encryptedUrl),
  };
}
