/* =====================================================================
 * Firebase Admin SDK (server-only). Used by API routes to verify tokens
 * and write privileged data (broadcast overrides).
 * ===================================================================*/
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let adminApp: App | null = null;
let _adminAuth: Auth | null = null;
let _adminDb: Firestore | null = null;

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
  try { return JSON.parse(raw); }
  catch (e) { throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON"); }
}

export function getAdmin() {
  if (!adminApp) {
    adminApp = getApps()[0] || initializeApp({ credential: cert(loadServiceAccount()) });
    _adminAuth = getAuth(adminApp);
    _adminDb = getFirestore(adminApp);
  }
  return { app: adminApp, auth: _adminAuth!, db: _adminDb! };
}

export async function verifyIdToken(token: string) {
  const { auth } = getAdmin();
  return auth.verifyIdToken(token);
}

/* Built-in super-admin emails — always recognized regardless of env vars.
 * Matches the hardcoded whitelist in firestore.rules. */
const BUILTIN_ADMINS = ["raz.fridman1@gmail.com"];

export function adminEmails(): string[] {
  const fromEnv = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  const builtin = BUILTIN_ADMINS.map(e => e.toLowerCase());
  return [...new Set([...builtin, ...fromEnv])];
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

/* AI-access gate. Returns true if this user is BLOCKED from AI features.
 * Super-admins bypass the block automatically. */
export async function isAiBlocked(uid: string, email?: string | null): Promise<boolean> {
  if (isAdminEmail(email)) return false;
  try {
    const { db } = getAdmin();
    const snap = await db.collection("profiles").doc(uid).get();
    const data = snap.data() as any;
    return !!data?.aiBlocked;
  } catch {
    return false;
  }
}
