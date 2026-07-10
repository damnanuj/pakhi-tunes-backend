import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { AppError } from '../utils/AppError.js';

let initialized = false;

function getServiceAccountFromEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  let privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  // Support escaped newlines from .env / hosting dashboards
  privateKey = privateKey.replace(/\\n/g, '\n');

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

export function initFirebaseAdmin() {
  if (initialized) {
    return getApp();
  }

  if (getApps().length > 0) {
    initialized = true;
    return getApp();
  }

  const serviceAccount = getServiceAccountFromEnv();
  if (!serviceAccount) {
    throw new AppError(
      'Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.',
      503
    );
  }

  initializeApp({
    credential: cert({
      projectId: serviceAccount.projectId,
      clientEmail: serviceAccount.clientEmail,
      privateKey: serviceAccount.privateKey,
    }),
  });

  initialized = true;
  return getApp();
}

/**
 * Verifies a Firebase ID token and returns decoded claims.
 * @param {string} idToken
 */
export async function verifyFirebaseIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string' || !idToken.trim()) {
    throw new AppError('idToken is required', 400);
  }

  initFirebaseAdmin();

  try {
    return await getAuth().verifyIdToken(idToken.trim());
  } catch (error) {
    console.error('[firebaseAdmin] verifyIdToken failed:', error?.code ?? error?.message);
    throw new AppError('Invalid or expired Google sign-in token', 401);
  }
}
