import 'dotenv/config';
import mongoose from 'mongoose';
import AppConfig from '../src/models/AppConfig.js';
import { APP_CONFIG_DEFAULTS } from '../src/controllers/appConfigController.js';

export const DEMO_RELEASE_SECTIONS = [
  {
    title: "What's new",
    items: [
      'Browse music by genre, new songs, albums, and top artists',
      'Search songs and explore new releases',
      'Save favourites and download tracks for offline listening',
      'Nearby listening — scan and join live sessions in sync',
    ],
  },
  {
    title: 'Bug fixes',
    items: [
      'Fixed home screen crash after signing in',
      'Fixed update popup crash on app launch',
      'Improved connection error handling across screens',
    ],
  },
  {
    title: 'Improvements',
    items: [
      'Guest limits for downloads and favourites',
      'Clearer location permission dialogs',
      'App config refresh when returning to the app',
    ],
  },
];

export const DEMO_APP_CONFIG = {
  updateAvailable: true,
  forceUpdate: false,
  latestVersion: '1.2.0',
  downloadUrl: 'https://play.google.com/store/apps/details?id=your.app',
  updateTitle: 'Update Available',
  updateMessage: 'Pakhi Tunes 1.2.0 is ready with new features and fixes.',
  forceUpdateTitle: 'Update Required',
  forceUpdateMessage:
    'This version is no longer supported. Please update to continue.',
  releaseSections: DEMO_RELEASE_SECTIONS,
};

async function main() {
  const isDemo = process.argv.includes('--demo');
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri);

  if (isDemo) {
    const doc = await AppConfig.findOneAndUpdate(
      {},
      { $set: DEMO_APP_CONFIG },
      { new: true, upsert: true, sort: { updatedAt: -1 } }
    );
    console.log('Upserted demo AppConfig:');
    console.log(JSON.stringify(doc.toObject(), null, 2));
    console.log('\nSoft update is ON (updateAvailable=true, forceUpdate=false).');
    console.log('Set forceUpdate=true in MongoDB to test blocking mode.');
    await mongoose.disconnect();
    return;
  }

  const existing = await AppConfig.findOne().sort({ updatedAt: -1 });

  if (existing) {
    console.log('AppConfig already exists:');
    console.log(JSON.stringify(existing.toObject(), null, 2));
    console.log('\nEdit updateAvailable / forceUpdate in MongoDB to test popups.');
    console.log('Run with --demo to upsert sample release notes for testing.');
    await mongoose.disconnect();
    return;
  }

  const doc = await AppConfig.create({ ...APP_CONFIG_DEFAULTS });
  console.log('Created AppConfig document:');
  console.log(JSON.stringify(doc.toObject(), null, 2));
  console.log('\nToggle in MongoDB (appconfigs collection):');
  console.log('  Soft update:  updateAvailable=true,  forceUpdate=false');
  console.log('  Force update: updateAvailable=true,  forceUpdate=true');
  console.log('  No popup:     updateAvailable=false, forceUpdate=false');
  console.log('\nRun: npm run seed:app-config:demo');

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
