import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authedAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const decoded = await verifyIdToken(m[1]);
  if (!isAdminEmail(decoded.email)) throw Object.assign(new Error("forbidden"), { status: 403 });
  return decoded;
}

/* GET /api/admin/user-data?uid=... — single user complete dump (god-view) */
export async function GET(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const url = new URL(req.url);
  const uid = url.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "missing uid" }, { status: 400 });

  const { db, auth } = getAdmin();
  let authMeta: any = null;
  try {
    const r = await auth.getUser(uid);
    authMeta = {
      uid: r.uid, email: r.email, displayName: r.displayName,
      disabled: r.disabled, providers: r.providerData.map(p => p.providerId),
      created: r.metadata.creationTime, lastLogin: r.metadata.lastSignInTime,
    };
  } catch {}

  const profile = (await db.collection("profiles").doc(uid).get()).data() || null;
  const managed = (await db.collection("managed_users").doc(uid).get()).data() || null;
  const favs    = (await db.collection("user_favorites").doc(uid).get()).data() || null;
  const reminders = (await db.collection("user_reminders").doc(uid).get()).data() || null;
  const emailPrefs = (await db.collection("email_prefs").doc(uid).get()).data() || null;
  const jokerUsage = (await db.collection("joker_usage").doc(uid).get()).data() || null;

  const predSnap = await db.collection("predictions").where("uid", "==", uid).get();
  const predictions = predSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const memSnap = await db.collection("group_memberships").where("uid", "==", uid).get();
  const memberships = memSnap.docs.map(d => d.data());

  return NextResponse.json({
    auth: authMeta,
    profile, managed, favs, reminders, emailPrefs, jokerUsage,
    predictions, memberships,
  });
}
