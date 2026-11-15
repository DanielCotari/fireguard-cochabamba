import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

function requireFirebase() {
  if (!auth || !db) {
    throw new Error('Firebase no está configurado. Copia mobile/.env.example a mobile/.env y configura el proyecto o los emuladores.');
  }
}

export async function registerCitizen(name: string, email: string, password: string, phone: string) {
  requireFirebase();
  const credential = await createUserWithEmailAndPassword(auth!, email.trim(), password);
  await updateProfile(credential.user, { displayName: name.trim() });
  await setDoc(doc(db!, 'users', credential.user.uid), {
    displayName: name.trim(),
    email: credential.user.email,
    phone: phone.trim() || null,
    createdAt: serverTimestamp(),
  });
}

export async function signIn(email: string, password: string) {
  requireFirebase();
  return signInWithEmailAndPassword(auth!, email.trim(), password);
}

export async function requestPasswordReset(email: string) {
  requireFirebase();
  await sendPasswordResetEmail(auth!, email.trim());
}

export async function signOutCurrentUser() {
  requireFirebase();
  await signOut(auth!);
}
