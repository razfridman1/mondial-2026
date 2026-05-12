/* =====================================================================
 * Firebase client SDK (browser). Singleton init.
 * ===================================================================*/
"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged,
  type Auth, type User,
} from "firebase/auth";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, onSnapshot,
  query, where, type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

export function getFirebase() {
  if (typeof window === "undefined") return { app: null, auth: null, db: null };
  if (!app) {
    app = getApps()[0] || initializeApp(firebaseConfig);
    _auth = getAuth(app);
    _db = getFirestore(app);
  }
  return { app, auth: _auth, db: _db };
}

export async function loginWithGoogle(): Promise<User> {
  const { auth } = getFirebase();
  if (!auth) throw new Error("Firebase not initialized");
  const res = await signInWithPopup(auth, new GoogleAuthProvider());
  return res.user;
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const { auth } = getFirebase();
  if (!auth) throw new Error("Firebase not initialized");
  const res = await signInWithEmailAndPassword(auth, email, password);
  return res.user;
}

/* Sign in with `identifier` that's either an email or a username.
 * If it's not an email, we resolve via /api/auth/resolve-username first. */
export async function loginWithIdentifier(identifier: string, password: string): Promise<User> {
  const trimmed = identifier.trim();
  let email = trimmed;
  if (!trimmed.includes("@")) {
    const r = await fetch(`/api/auth/resolve-username?u=${encodeURIComponent(trimmed.toLowerCase())}`);
    if (!r.ok) {
      const err = r.status === 404 ? "שם משתמש לא קיים" : "שגיאת רשת";
      throw new Error(err);
    }
    const data = await r.json();
    email = data.email;
  }
  return loginWithEmail(email, password);
}

export async function registerWithEmail(email: string, password: string): Promise<User> {
  const { auth } = getFirebase();
  if (!auth) throw new Error("Firebase not initialized");
  const res = await createUserWithEmailAndPassword(auth, email, password);
  return res.user;
}

export async function signOut(): Promise<void> {
  const { auth } = getFirebase();
  if (!auth) return;
  await fbSignOut(auth);
}

export function watchAuth(cb: (user: User | null) => void): () => void {
  const { auth } = getFirebase();
  if (!auth) return () => {};
  return onAuthStateChanged(auth, cb);
}

/* ---------- Firestore helpers ---------- */
export async function getUserDoc<T>(path: string): Promise<T | null> {
  const { db } = getFirebase();
  if (!db) return null;
  const snap = await getDoc(doc(db, path));
  return snap.exists() ? (snap.data() as T) : null;
}

export async function setUserDoc(path: string, data: any): Promise<void> {
  const { db } = getFirebase();
  if (!db) return;
  await setDoc(doc(db, path), { ...data, updatedAt: Date.now() }, { merge: true });
}

export async function deleteUserDoc(path: string): Promise<void> {
  const { db } = getFirebase();
  if (!db) return;
  await deleteDoc(doc(db, path));
}

export function subscribeOverrides(cb: (overrides: Record<string, any>) => void): () => void {
  const { db } = getFirebase();
  if (!db) return () => {};
  const q = query(collection(db, "broadcast_overrides"));
  return onSnapshot(q, snap => {
    const map: Record<string, any> = {};
    snap.forEach(d => { map[d.id] = d.data(); });
    cb(map);
  });
}

export function subscribeSimConfig(cb: (cfg: any | null) => void): () => void {
  const { db } = getFirebase();
  if (!db) return () => {};
  return onSnapshot(doc(db, "sim_config", "global"), snap => {
    cb(snap.exists() ? snap.data() : null);
  });
}

export { GoogleAuthProvider };
