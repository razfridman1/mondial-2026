import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================================
 * Admin-only Managed Users API.
 *
 *   GET    /api/admin/users       → list all managed users
 *   POST   /api/admin/users       → create user from { username, password, displayName?, role? }
 *
 *  Authentication: Bearer token of the calling user; user.email must be in ADMIN_EMAILS.
 *  Synthetic email pattern: `${username}@mondial2026.local`
 * ===================================================================*/

const SYNTH_DOMAIN = "mondial2026.local";

async function authedAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const decoded = await verifyIdToken(m[1]);
  if (!isAdminEmail(decoded.email)) throw Object.assign(new Error("forbidden"), { status: 403 });
  return decoded;
}

function normalizeUsername(u: string) {
  return u.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

export async function GET(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const { db } = getAdmin();
  const snap = await db.collection("managed_users").orderBy("createdAt", "desc").get();
  const users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  let admin;
  try { admin = await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const body = await req.json();
  const username = normalizeUsername(body.username || "");
  const password = (body.password || "").toString();
  const displayName = (body.displayName || username).toString().slice(0, 60);
  const role = body.role === "admin" ? "admin" : "user";

  if (username.length < 3 || username.length > 30)
    return NextResponse.json({ error: "username must be 3-30 chars (a-z0-9._-)" }, { status: 400 });
  if (password.length < 6)
    return NextResponse.json({ error: "password must be 6+ chars" }, { status: 400 });

  const { auth, db } = getAdmin();

  // Reject duplicate username
  const idxRef = db.collection("username_lookup").doc(username);
  const idx = await idxRef.get();
  if (idx.exists) return NextResponse.json({ error: "username already exists" }, { status: 409 });

  const email = `${username}@${SYNTH_DOMAIN}`;

  /* Create Firebase auth user — emailVerified=true so login works immediately */
  let userRecord;
  try {
    userRecord = await auth.createUser({ email, password, displayName, emailVerified: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  const now = Date.now();
  await idxRef.set({ uid: userRecord.uid, email, role, createdAt: now });
  await db.collection("managed_users").doc(userRecord.uid).set({
    uid: userRecord.uid,
    username,
    email,
    displayName,
    role,
    disabled: false,
    createdBy: admin.email,
    createdAt: now,
    updatedAt: now,
  });
  /* Pre-create a profile so leaderboard / activity show this user nicely */
  await db.collection("profiles").doc(userRecord.uid).set({
    uid: userRecord.uid,
    avatarId: "messi",
    displayName,
    joinedAt: now,
    managed: true,
  }, { merge: true });

  return NextResponse.json({
    uid: userRecord.uid,
    username,
    email,
    displayName,
    role,
  });
}
