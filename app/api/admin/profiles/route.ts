import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";

export const runtime = "nodejs";

async function authedAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const decoded = await verifyIdToken(m[1]);
  if (!isAdminEmail(decoded.email)) throw Object.assign(new Error("forbidden"), { status: 403 });
  return decoded;
}

/* GET /api/admin/profiles — all profiles, including Google sign-ups */
export async function GET(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const { db, auth } = getAdmin();
  const profSnap = await db.collection("profiles").get();
  const profiles: any[] = [];
  for (const d of profSnap.docs) {
    const data = d.data() as any;
    /* Pull Firebase Auth metadata too — email, disabled state, lastLogin */
    let authMeta: any = {};
    try {
      const rec = await auth.getUser(d.id);
      authMeta = {
        email: rec.email,
        disabled: rec.disabled,
        createdAt: rec.metadata.creationTime,
        lastLoginAt: rec.metadata.lastSignInTime,
        provider: rec.providerData[0]?.providerId,
      };
    } catch {}
    profiles.push({ uid: d.id, ...data, ...authMeta });
  }
  return NextResponse.json(profiles);
}

/* PATCH /api/admin/profiles { uid, displayName?, avatarId?, bio?, theme? } */
export async function PATCH(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const body = await req.json();
  if (!body.uid) return NextResponse.json({ error: "missing uid" }, { status: 400 });

  const { db, auth } = getAdmin();
  const patch: any = { updatedByAdmin: true, updatedAt: Date.now() };
  if (typeof body.displayName === "string") patch.displayName = body.displayName.slice(0, 60);
  if (typeof body.avatarId    === "string") patch.avatarId    = body.avatarId;
  if (typeof body.bio         === "string") patch.bio         = body.bio.slice(0, 240);
  if (body.theme === "dark" || body.theme === "light") patch.theme = body.theme;

  await db.collection("profiles").doc(body.uid).set(patch, { merge: true });

  /* Mirror displayName into Firebase Auth so it shows in console */
  if (patch.displayName) {
    try { await auth.updateUser(body.uid, { displayName: patch.displayName }); } catch {}
  }
  /* Disable / Enable user via auth */
  if (typeof body.disabled === "boolean") {
    try { await auth.updateUser(body.uid, { disabled: body.disabled }); } catch {}
  }
  /* Reset password (any user — managed OR Google. Note: for Google users this
   *  adds a password method to their account but does not break Google login.) */
  if (typeof body.password === "string" && body.password.length >= 6) {
    try { await auth.updateUser(body.uid, { password: body.password }); } catch {}
  }

  return NextResponse.json({ ok: true });
}

/* DELETE /api/admin/profiles { uid } — nuke user from Firebase Auth + all collections */
export async function DELETE(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const body = await req.json();
  const uid = body.uid;
  if (!uid) return NextResponse.json({ error: "missing uid" }, { status: 400 });

  const { db, auth } = getAdmin();
  try { await auth.deleteUser(uid); } catch {}

  /* Cascade delete every doc related to the user */
  await db.collection("profiles").doc(uid).delete().catch(() => {});
  await db.collection("user_favorites").doc(uid).delete().catch(() => {});
  await db.collection("user_reminders").doc(uid).delete().catch(() => {});
  await db.collection("email_prefs").doc(uid).delete().catch(() => {});
  await db.collection("joker_usage").doc(uid).delete().catch(() => {});
  await db.collection("managed_users").doc(uid).delete().catch(() => {});

  const preds = await db.collection("predictions").where("uid", "==", uid).get();
  await Promise.all(preds.docs.map(d => d.ref.delete()));
  const mems = await db.collection("group_memberships").where("uid", "==", uid).get();
  await Promise.all(mems.docs.map(d => d.ref.delete()));

  return NextResponse.json({ ok: true });
}
