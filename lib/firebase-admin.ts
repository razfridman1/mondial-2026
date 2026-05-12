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

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}
