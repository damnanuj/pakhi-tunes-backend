/**
 * Curated genre catalog. Each genre maps to multiple editorial playlists
 * that are merged when fetching songs.
 */
export const GENRE_MAP = [
  {
    slug: 'romance',
    name: 'Romance',
    image: 'https://c.saavncdn.com/editorial/BestOfRomanceHindi_20260617045649.jpg?bch=1781674015',
    playlists: [
      { id: '903166403', name: 'Best Of Romance - Hindi' },
      { id: '83421839', name: 'Ishqiyaan' },
      { id: '155321547', name: '2000s Romance - Hindi' },
      { id: '618305127', name: 'Decade Of 2010s: Romance - Hindi' },
      { id: '50347113', name: 'Tere Bina' },
    ],
  },
  {
    slug: 'sad',
    name: 'Sad Songs',
    image: 'https://c.saavncdn.com/editorial/ArijitSinghSadSongsHindi_20240226083401.jpg?bch=1781164586',
    playlists: [
      { id: '802336660', name: 'Arijit Singh - Sad Songs - Hindi' },
      { id: '149267518', name: 'Pop Sad Songs' },
      { id: '810634923', name: 'Best Of Sad Songs: 2000s' },
      { id: '1219294392', name: 'Sad Hindi Hits' },
    ],
  },
  {
    slug: 'rock',
    name: 'Rock',
    image: 'https://c.saavncdn.com/editorial/BestOfRockHindi_20260325065230.jpg?bch=1781164889',
    playlists: [
      { id: '330056058', name: 'Best Of Rock - Hindi' },
      { id: '156710699', name: 'Bollywood Rock - Workout Mix' },
      { id: '169030551', name: 'Rock To Work' },
    ],
  },
  {
    slug: 'pop',
    name: 'Pop',
    image: 'https://c.saavncdn.com/editorial/BestOfIndipopHindi_20260504065326.jpg?bch=1781164712',
    playlists: [
      { id: '940775963', name: 'Best Of Pop - Hindi' },
      { id: '156473621', name: 'Asli Pop' },
    ],
  },
  {
    slug: 'dance',
    name: 'Dance',
    image: 'https://c.saavncdn.com/editorial/BestOfDanceHindi_20260617045802.jpg?bch=1781674069',
    playlists: [
      { id: '932189657', name: 'Best Of Dance - Hindi' },
      { id: '154546827', name: '90s Dance Dhamaaka' },
      { id: '158229653', name: '2000s Dance Dhamaaka' },
      { id: '618308794', name: 'Decade Of 2010s: Dance Dhamaaka - Hindi' },
      { id: '5148894', name: 'Nach Le' },
    ],
  },
  {
    slug: 'hiphop',
    name: 'Hip Hop & Party',
    image: 'https://c.saavncdn.com/editorial/HipHopParty_20251229110720.jpg?bch=1776314060',
    playlists: [
      { id: '158224188', name: 'Hip Hop Party' },
      { id: '79653434', name: 'Non-Stop Party' },
      { id: '158199522', name: 'Club Beats' },
      { id: '153572365', name: 'Josh Hi Josh' },
    ],
  },
  {
    slug: 'ghazals',
    name: 'Ghazals',
    image: 'https://c.saavncdn.com/editorial/BestOfGhazalsHindi_20260325065302.jpg?bch=1781164640',
    playlists: [
      { id: '77076833', name: 'Best Of Ghazals - Hindi' },
      { id: '1263096360', name: 'Soulful Ghazals' },
    ],
  },
  {
    slug: 'indie',
    name: 'Indie',
    image: 'https://c.saavncdn.com/editorial/BestOfIndieHindi_20260617091926.jpg',
    playlists: [
      { id: '107605145', name: 'Best Of Indie - Hindi' },
      { id: '1219169738', name: 'New Indie - Hindi' },
      { id: '1265890645', name: 'ArtistOne Finds' },
    ],
  },
  {
    slug: 'lofi',
    name: 'Lo-Fi & Chill',
    image: 'https://c.saavncdn.com/editorial/ChillMaaro_20260617045835.jpg?bch=1781674103',
    playlists: [
      { id: '158223987', name: 'Chill Maaro' },
      { id: '1079336813', name: 'Chill Maaro: Lo-Fi Mix' },
      { id: '950698071', name: 'Best Indian Lo-Fi Hits' },
    ],
  },
  {
    slug: 'retro',
    name: 'Retro',
    image: 'https://c.saavncdn.com/editorial/BestOf90sHindi_20251125041813.jpg?bch=1781827672',
    playlists: [
      { id: '3379491', name: 'Best Of 90s - Hindi' },
      { id: '155321561', name: 'Best Of 2000s - Hindi' },
      { id: '159470178', name: 'Best Of 70s - Hindi' },
      { id: '1164340768', name: 'Best Of 2010s - Hindi' },
    ],
  },
  {
    slug: 'unplugged',
    name: 'Unplugged',
    image: 'https://c.saavncdn.com/editorial/SirfUnplugged_20250530053253.jpg?bch=1781164525',
    playlists: [
      { id: '72903410', name: 'Sirf Unplugged' },
      { id: '75396573', name: 'Coffee Unplugged' },
      { id: '101462681', name: 'Retro Chill' },
    ],
  },
  {
    slug: 'devotional',
    name: 'Devotional & Sufi',
    image: 'https://c.saavncdn.com/editorial/SufiHitsCarvaanSelect_20250718104134.jpg?bch=1752837127',
    playlists: [
      { id: '1262711873', name: 'Sufi Hits - Carvaan Select' },
      { id: '1022248677', name: 'Sufiyana' },
      { id: '1217129837', name: 'Lo-Fi Devotional' },
    ],
  },
];

export function getGenreBySlug(slug) {
  const normalized = String(slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) return null;

  return (
    GENRE_MAP.find((g) => g.slug === normalized) ??
    GENRE_MAP.find((g) => g.name.toLowerCase() === String(slug ?? '').trim().toLowerCase()) ??
    null
  );
}

export function listGenres() {
  return GENRE_MAP;
}
