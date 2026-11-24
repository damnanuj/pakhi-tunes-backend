import CatalogCache from '../models/CatalogCache.js';

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

export const CATALOG_CACHE_TTL = {
  genres: TWO_DAYS_MS,
  topArtists: TWO_DAYS_MS,
  newReleases: ONE_HOUR_MS,
};

function isFresh(entry) {
  return Boolean(entry?.expiresAt) && new Date(entry.expiresAt).getTime() > Date.now();
}

/**
 * Return the saved payload when it is still inside its window.
 * Otherwise one caller runs fetcher and saves the result. Concurrent callers
 * for the same key wait on that refresh instead of fetching again.
 * A second server process can still fetch once on its own. That is acceptable.
 */
export function createGetOrSet(store) {
  const inflight = new Map();

  return async function getOrSet(key, ttlMs, fetcher) {
    const existing = await store.findOne(key);
    if (isFresh(existing)) return existing.payload;

    const current = inflight.get(key);
    if (current) return current;

    const refresh = (async () => {
      const again = await store.findOne(key);
      if (isFresh(again)) return again.payload;

      const payload = await fetcher();
      await store.upsert(key, payload, new Date(Date.now() + ttlMs));
      return payload;
    })().finally(() => {
      inflight.delete(key);
    });

    inflight.set(key, refresh);
    return refresh;
  };
}

const mongoStore = {
  findOne(key) {
    return CatalogCache.findOne({ key }).lean();
  },
  upsert(key, payload, expiresAt) {
    return CatalogCache.findOneAndUpdate(
      { key },
      { key, payload, expiresAt },
      { upsert: true }
    );
  },
};

export const getOrSet = createGetOrSet(mongoStore);
