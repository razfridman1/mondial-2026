import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function authedAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const decoded = await verifyIdToken(m[1]);
  if (!isAdminEmail(decoded.email)) throw Object.assign(new Error("forbidden"), { status: 403 });
  return decoded;
}

/* GET /api/admin/profiles — all profiles, including Google sign-ups.
 * Enriches each profile with auth metadata, group memberships, and managed-user info. */
export async function GET(req: Request) {
  try {
    try { await authedAdmin(req); }
    catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
    const { db, auth } = getAdmin();

    /* Pre-load all memberships and managed-user docs once for O(1) lookups */
    const [memSnap, managedSnap, profSnap] = await Promise.all([
      db.collection("group_memberships").get(),
      db.collection("managed_users").get(),
      db.collection("profiles").get(),
    ]);

    const groupsByUid: Record<string, string[]> = {};
    memSnap.forEach(d => {
      const data = d.data() as any;
      if (!groupsByUid[data.uid]) groupsByUid[data.uid] = [];
      groupsByUid[data.uid].push(data.groupId);
    });

    const managedByUid: Record<string, any> = {};
    managedSnap.forEach(d => { managedByUid[d.id] = d.data(); });

    /* Fetch ALL auth metadata in a single batched call (auth.getUsers supports up to 100 uids per call).
     * Avoids the per-user RESOURCE_EXHAUSTED throttling we'd hit with parallel auth.getUser calls. */
    const authMetaByUid: Record<string, any> = {};
    const allUids = [
      ...profSnap.docs.map(d => d.id),
      ...Object.keys(managedByUid),
    ];
    const uniqUids = [...new Set(allUids)];
    /* Chunk into groups of 100 */
    for (let i = 0; i < uniqUids.length; i += 100) {
      const chunk = uniqUids.slice(i, i + 100).map(uid => ({ uid }));
      try {
        const res = await auth.getUsers(chunk);
        for (const u of res.users) {
          authMetaByUid[u.uid] = {
            email: u.email,
            disabled: u.disabled,
            createdAt: u.metadata.creationTime,
            lastLoginAt: u.metadata.lastSignInTime,
            provider: u.providerData[0]?.providerId,
          };
        }
      } catch { /* if a batch fails, fall through with empty auth meta — Firestore data still shown */ }
    }

    const profiles: any[] = [];
    for (const d of profSnap.docs) {
      const data = d.data() as any;
      const managed = managedByUid[d.id];
      profiles.push({
        uid: d.id,
        ...data,
        ...(authMetaByUid[d.id] || {}),
        groupIds: groupsByUid[d.id] || [],
        isManaged: !!managed,
        username: managed?.username || null,
        role: managed?.role || (data.role || "user"),
      });
    }

    /* Also include managed users who don't have a profile doc yet (edge case) */
    for (const [uid, managed] of Object.entries(managedByUid)) {
      if (profiles.find(p => p.uid === uid)) continue;
      profiles.push({
        uid,
        displayName: managed.displayName,
        email: managed.email,
        username: managed.username,
        role: managed.role,
        disabled: managed.disabled,
        isManaged: true,
        groupIds: groupsByUid[uid] || [],
      });
    }

    return NextResponse.json(profiles);
  } catch (e: any) {
    console.error("[/api/admin/profiles] GET failed:", e);
    return NextResponse.json({ error: "server_error", message: e?.message || String(e) }, { status: 500 });
  }
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
  if (typeof body.aiBlocked   === "boolean") patch.aiBlocked   = body.aiBlocked;

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
  await db.collection("joker_usage").doc(uid).delete().catch(() => {});
  await db.collection("managed_users").doc(uid).delete().catch(() => {});

  const preds = await db.collection("predictions").where("uid", "==", uid).get();
  await Promise.all(preds.docs.map(d => d.ref.delete()));
  const mems = await db.collection("group_memberships").where("uid", "==", uid).get();
  await Promise.all(mems.docs.map(d => d.ref.delete()));

  return NextResponse.json({ ok: true });
}
