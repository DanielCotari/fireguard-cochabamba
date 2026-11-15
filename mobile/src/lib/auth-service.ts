import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, functions } from '@/lib/firebase';

function requireFirebase() {
  if (!auth || !db || !functions) {
    throw new Error('Firebase no está configurado. Copia mobile/.env.example a mobile/.env y configura el proyecto o los emuladores.');
  }
}

export async function registerCitizen(name: string, email: string, password: string, phone: string) {
  requireFirebase();
  const normalizedEmail = email.trim();
  const currentUser = auth!.currentUser;
  const user = currentUser?.email?.toLowerCase() === normalizedEmail.toLowerCase()
    ? currentUser
    : (await createUserWithEmailAndPassword(auth!, normalizedEmail, password)).user;

  if (!user.displayName) {
    await updateProfile(user, { displayName: name.trim() });
  }

  const ensureAccess = httpsCallable(functions!, 'ensureCitizenAccess');
  await ensureAccess({});

  const profileRef = doc(db!, 'users', user.uid);
  const profile = await getDoc(profileRef);
  if (!profile.exists()) {
    await setDoc(profileRef, {
      displayName: name.trim(),
      phone: phone.trim() || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    const fields = ['displayName', 'phone', 'createdAt', 'updatedAt'];
    const profileData = profile.data();
    if (Object.keys(profileData).length !== fields.length || fields.some((field) => !(field in profileData))) {
      throw new Error('El perfil existente usa el esquema anterior y requiere la migración administrativa antes de completarse.');
    }
  }
  await user.getIdToken(true);
}

export async function resumeCitizenRegistration() {
  requireFirebase();
  const user = auth!.currentUser;
  if (!user) throw new Error('Inicia sesión para reintentar el alta de la cuenta.');
  const ensureAccess = httpsCallable(functions!, 'ensureCitizenAccess');
  const result = await ensureAccess({});
  if (result.data === null || typeof result.data !== 'object' || !('active' in result.data) || result.data.active !== true) {
    throw new Error('El servidor no confirmó el acceso de la cuenta.');
  }

  const profileRef = doc(db!, 'users', user.uid);
  const profile = await getDoc(profileRef);
  if (!profile.exists()) {
    const displayName = user.displayName?.trim();
    if (!displayName) throw new Error('Completa tu nombre desde el formulario de registro para crear el perfil.');
    await setDoc(profileRef, {
      displayName,
      phone: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await user.getIdToken(true);
}

export async function signIn(email: string, password: string) {
  requireFirebase();
  const credential = await signInWithEmailAndPassword(auth!, email.trim(), password);
  const access = await getDoc(doc(db!, 'access', credential.user.uid));
  if (!access.exists() || access.data().active !== true) {
    await signOut(auth!);
    throw new Error('La cuenta no tiene acceso activo. Contacta a una persona administradora para solicitar activación.');
  }
  return credential;
}

export async function requestPasswordReset(email: string) {
  requireFirebase();
  await sendPasswordResetEmail(auth!, email.trim());
}

export async function signOutCurrentUser() {
  requireFirebase();
  await signOut(auth!);
}
