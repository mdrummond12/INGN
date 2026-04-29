import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteField,
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase.js';

// ── User doc ────────────────────────────────────────────────────────────

export async function ensureUserDoc(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const base = {
    email: user.email || null,
    displayName: user.displayName || null,
    photoURL: user.photoURL || null,
    lastLoginAt: serverTimestamp(),
  };
  if (snap.exists()) {
    await updateDoc(ref, base);
  } else {
    await setDoc(ref, { ...base, createdAt: serverTimestamp() });
  }
}

export async function getUserData(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

// ── API key (per-user, single value) ────────────────────────────────────

export async function saveApiKey(uid, key) {
  await updateDoc(doc(db, 'users', uid), { mobieApiKey: key });
}

export async function clearApiKey(uid) {
  await updateDoc(doc(db, 'users', uid), { mobieApiKey: deleteField() });
}

// ── Profiles (named presets) ────────────────────────────────────────────

export async function listProfiles(uid) {
  const q = query(collection(db, 'users', uid, 'profiles'), orderBy('updatedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createProfile(uid, data) {
  const ref = await addDoc(collection(db, 'users', uid, 'profiles'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateProfile(uid, profileId, data) {
  await updateDoc(doc(db, 'users', uid, 'profiles', profileId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProfile(uid, profileId) {
  await deleteDoc(doc(db, 'users', uid, 'profiles', profileId));
}

export async function setActiveProfile(uid, profileId) {
  await updateDoc(doc(db, 'users', uid), { lastProfileId: profileId });
}
