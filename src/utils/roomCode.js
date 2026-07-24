import ActiveSession from '../models/ActiveSession.js';

const MAX_ATTEMPTS = 5;

function generateFourDigitCode() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

/**
 * Generates a unique 4-digit room code not currently in use.
 * Retries up to MAX_ATTEMPTS times on collision.
 */
export async function generateUniqueRoomCode() {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = generateFourDigitCode();
    const existing = await ActiveSession.findOne({ roomCode: code }).select('_id').lean();
    if (!existing) return code;
  }
  throw new Error('Could not generate a unique room code');
}
