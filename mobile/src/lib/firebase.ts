import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);
const app = firebaseConfigured && typeof window !== 'undefined'
  ? getApps().length ? getApp() : initializeApp(config)
  : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;
export const functions = app
  ? getFunctions(app, process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'us-central1')
  : null;

if (app && process.env.EXPO_PUBLIC_FIREBASE_USE_EMULATORS === 'true') {
  const emulatorHost = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || '127.0.0.1';
  if (auth) connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  if (db) connectFirestoreEmulator(db, emulatorHost, 8080);
  if (storage) connectStorageEmulator(storage, emulatorHost, 9199);
  if (functions) connectFunctionsEmulator(functions, emulatorHost, 5001);
}
