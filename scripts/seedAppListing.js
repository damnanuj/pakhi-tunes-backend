import 'dotenv/config';
import mongoose from 'mongoose';
import AppListing from '../src/models/AppListing.js';

const SLUG = 'pakhi-tunes';
const SCREENSHOT = '/assets/projectsThumbnails/pakhi-tunes.webp';

export const SEED_APP_LISTING = {
  slug: SLUG,
  name: 'Pakhi Tunes',
  tagline: 'Free music streaming with nearby sessions',
  imageUrl: '/assets/projectsThumbnails/pakhi-tunes-icon.webp',
  screenshots: [SCREENSHOT, SCREENSHOT, SCREENSHOT, SCREENSHOT, SCREENSHOT, SCREENSHOT],
  description: [
    'Pakhi Tunes helps you discover and play music for free — from mood-based genres and new releases to quick song search. Build your library with favourites, downloads, and recent plays.',
    "What makes it different: Nearby Listening. Scan for people playing music around you, join their session, and listen in sync — or share what you're playing so others can tune in.",
    'Use the app as a guest or sign in to keep favourites and history synced across devices.',
  ],
  features: [
    'Stream and play music seamlessly',
    'Search songs, artists, and albums',
    'Stay up to date with the latest tracks and album releases',
    'Like and save your favourite tracks',
    'Discover the latest songs and albums in your preferred language',
    'Up Next — see and manage the upcoming songs in your playback queue',
    'Build your personal music library',
    'Download songs in your preferred quality (96 kbps, 128 kbps, or 320 kbps) for offline listening',
    'Enjoy your downloaded music offline, anytime',
    'View your listening history',
    'Background playback support',
    'Secure user authentication',
    'Clean and responsive user interface',
    'Nearby Listening — discover nearby users, see what they are listening to, join their session in real time, or share your own listening activity',
  ],
  category: 'Music & Audio',
  availableOn: ['Android'],
  downloadUrl: 'https://github.com/damnanuj/pakhi-tunes',
  downloadCount: 500,
  updatedOn: 'Jul 8, 2026',
};

async function main() {
  const isForce = process.argv.includes('--force');
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const existing = await AppListing.findOne({ slug: SLUG });

  if (existing && !isForce) {
    console.log(`App listing already exists for slug "${SLUG}".`);
    console.log('Run with --force to clear and re-seed.');
    await mongoose.disconnect();
    return;
  }

  if (isForce && existing) {
    await AppListing.deleteOne({ slug: SLUG });
    console.log(`Removed existing app listing for "${SLUG}".`);
  }

  const doc = await AppListing.create(SEED_APP_LISTING);
  console.log(`Seeded app listing for "${SLUG}":`);
  console.log(JSON.stringify(doc.toPublicObject(), null, 2));

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
