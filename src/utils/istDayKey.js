const IST_TIME_ZONE = 'Asia/Kolkata';

/**
 * Returns YYYY-MM-DD for the given date in Asia/Kolkata (IST).
 */
export function getIstDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIstDayKey(dayKey) {
  return typeof dayKey === 'string' && DAY_KEY_PATTERN.test(dayKey);
}

/**
 * UTC Date bounds for an IST calendar day (start inclusive, end exclusive).
 */
export function getIstDayBounds(dayKey) {
  if (!isValidIstDayKey(dayKey)) {
    throw new Error('Invalid IST day key');
  }

  const [year, month, day] = dayKey.split('-').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const offsetMs = getIstOffsetMs(new Date(utcGuess));
  const start = new Date(utcGuess - offsetMs);

  const nextDayKey = getIstDayKey(new Date(start.getTime() + 25 * 60 * 60 * 1000));
  const [ny, nm, nd] = nextDayKey.split('-').map(Number);
  const nextUtcGuess = Date.UTC(ny, nm - 1, nd, 0, 0, 0, 0);
  const nextOffsetMs = getIstOffsetMs(new Date(nextUtcGuess));
  const end = new Date(nextUtcGuess - nextOffsetMs);

  return { start, end };
}

function getIstOffsetMs(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIME_ZONE,
    timeZoneName: 'shortOffset',
  }).formatToParts(date);

  const tzName = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+5:30';
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) {
    return 5.5 * 60 * 60 * 1000;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

export { IST_TIME_ZONE };
