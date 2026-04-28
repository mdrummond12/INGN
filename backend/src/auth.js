import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

let initialized = false;

export function initAdmin() {
  if (initialized) return;
  // On Firebase App Hosting / Cloud Run, ADC supplies credentials automatically.
  // Locally, set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path.
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
  });
  initialized = true;
}

/**
 * Verify a Firebase ID token. Throws on failure; returns decoded claims on success.
 */
export async function verifyIdToken(idToken) {
  const decoded = await getAuth().verifyIdToken(idToken);
  return decoded;
}
