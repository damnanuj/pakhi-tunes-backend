import { AppError } from './AppError.js';
import { getIstDayBounds, getIstDayKey } from './istDayKey.js';

const RANGES = new Set(['today', '7d', '30d', '6m']);

export function resolveReportRange(rangeInput, now = new Date()) {
  const range = rangeInput == null || rangeInput === '' ? 'today' : String(rangeInput);
  if (!RANGES.has(range)) {
    throw new AppError('Invalid range', 400);
  }

  const to = getIstDayKey(now);
  const { from, bucket, keys } = resolveBuckets(range, to);
  const { start } = getIstDayBounds(from);
  const { end } = getIstDayBounds(to);

  return { range, from, to, start, end, bucket, keys };
}

function resolveBuckets(range, to) {
  if (range === 'today') {
    return { from: to, bucket: 'day', keys: [to] };
  }
  if (range === '7d') {
    const from = addIstDays(to, -6);
    return { from, bucket: 'day', keys: listDayKeys(from, to) };
  }
  if (range === '30d') {
    const from = addIstDays(to, -29);
    return { from, bucket: 'day', keys: listDayKeys(from, to) };
  }

  const fromMonth = addMonths(to.slice(0, 7), -5);
  const toMonth = to.slice(0, 7);
  return {
    from: `${fromMonth}-01`,
    bucket: 'month',
    keys: listMonthKeys(fromMonth, toMonth),
  };
}

function addIstDays(dayKey, days) {
  const { start } = getIstDayBounds(dayKey);
  return getIstDayKey(new Date(start.getTime() + days * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000));
}

function addMonths(monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${nextYear}-${nextMonth}`;
}

function listDayKeys(from, to) {
  const keys = [];
  let cursor = from;
  while (cursor <= to && keys.length < 40) {
    keys.push(cursor);
    cursor = addIstDays(cursor, 1);
  }
  return keys;
}

function listMonthKeys(from, to) {
  const keys = [];
  let cursor = from;
  while (cursor <= to && keys.length < 8) {
    keys.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return keys;
}
