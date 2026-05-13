import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================================
 *  PATCH  /api/admin/users/{uid}   → update displayName / role / disabled / password
 *  DELETE /api/admin/users/{uid}   → delete user (auth + firestore + profile)
 * ===================================================================*/

async function authedAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const decoded = await verifyIdToken(m[1]);
  if (!isAdminEmail(decoded.email)) throw Object.assign(new Error("forbidden"), { status: 403 });
  return decoded;
}

const SYNTHETIC_EMAIL_DOMAIN = "@mondial2026.local";
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export async function PATCH(req: Request, ctx: { params: { uid: string } }) {
  let admin;
  try { admin = await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const uid = ctx.params.uid;
  const { auth, db } = getAdmin();
  const body = await req.json();

  const userDoc = await db.collection("managed_users").doc(uid).get();
  if (!userDoc.exists) return NextResponse.json({ error: "user not found" }, { status: 404 });
  const existing = userDoc.data() as any;

  const updates: any = { updatedAt: Date.now(), updatedBy: admin.email };

  /* ---------- displayName ---------- */
  if (typeof body.displayName === "string" && body.displayName.length) {
    updates.displayName = body.displayName.slice(0, 60);
    await auth.updateUser(uid, { displayName: updates.displayName });
    await db.collection("profiles").doc(uid).set({ displayName: updates.displayName }, { merge: true });
  }

  /* ---------- username (rename) ---------- */
  if (typeof body.username === "string" && body.username !== existing.username) {
    const next = body.username.trim().toLowerCase();
    if (!USERNAME_RE.test(next)) {
      return NextResponse.json({ error: "username invalid (3-30 chars, a-z 0-9 . _ -, must start with letter/digit)" }, { status: 400 });
    }
    /* Check uniqueness */
    const lookupRef = db.collection("username_lookup").doc(next);
    const lookupSnap = await lookupRef.get();
    if (lookupSnap.exists) {
      return NextResponse.json({ error: "username already taken" }, { status: 409 });
    }
    const newEmail = `${next}${SYNTHETIC_EMAIL_DOMAIN}`;
    try {
      await auth.updateUser(uid, { email: newEmail });
    } catch (e: any) {
      return NextResponse.json({ error: "auth update failed", details: e.message }, { status: 500 });
    }
    /* Move username_lookup doc: delete old, create new */
    if (existing.username) {
      await db.collection("username_lookup").doc(existing.username).delete().catch(() => {});
    }
    await lookupRef.set({
      uid,
      email: newEmail,
      role: existing.role || "user",
      createdAt: existing.createdAt || Date.now(),
    });
    updates.username = next;
    updates.email = newEmail;
  }

  /* ---------- role ---------- */
  if (body.role === "admin" || body.role === "user") {
    updates.role = body.role;
    const username = updates.username || existing.username;
    if (username) {
      await db.collection("username_lookup").doc(username).set({ role: body.role }, { merge: true });
    }
  }

  /* ---------- disabled ---------- */
  if (typeof body.disabled === "boolean") {
    updates.disabled = body.disabled;
    await auth.updateUser(uid, { disabled: body.disabled });
  }

  /* ---------- password ---------- */
  if (typeof body.password === "string" && body.password.length >= 6) {
    await auth.updateUser(uid, { password: body.password });
    updates.passwordResetAt = Date.now();
  }

  /* ---------- aiBlocked ---------- */
  if (typeof body.aiBlocked === "boolean") {
    await db.collection("profiles").doc(uid).set({ aiBlocked: body.aiBlocked }, { merge: true });
  }

  /* ---------- group membership: addToGroupId / removeFromGroupId ---------- */
  if (typeof body.addToGroupId === "string" && body.addToGroupId.length) {
    const gid = body.addToGroupId;
    const memId = `${uid}_${gid}`;
    const memRef = db.collection("group_memberships").doc(memId);
    const memSnap = await memRef.get();
    if (!memSnap.exists) {
      await memRef.set({ uid, groupId: gid, joinedAt: Date.now(), role: "member" });
      /* bump memberCount */
      const gRef = db.collection("groups").doc(gid);
      const gSnap = await gRef.get();
      if (gSnap.exists) {
        await gRef.update({ memberCount: ((gSnap.data() as any).memberCount || 1) + 1 });
      }
    }
  }
  if (typeof body.removeFromGroupId === "string" && body.removeFromGroupId.length) {
    const gid = body.removeFromGroupId;
    const memId = `${uid}_${gid}`;
    const memRef = db.collection("group_memberships").doc(memId);
    const memSnap = await memRef.get();
    if (memSnap.exists) {
      await memRef.delete();
      const gRef = db.collection("groups").doc(gid);
      const gSnap = await gRef.get();
      if (gSnap.exists) {
        const cur = (gSnap.data() as any).memberCount || 1;
        await gRef.update({ memberCount: Math.max(0, cur - 1) });
      }
    }
  }

  await db.collection("managed_users").doc(uid).set(updates, { merge: true });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: { uid: string } }) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const uid = ctx.params.uid;
  const { auth, db } = getAdmin();

  const userDoc = await db.collection("managed_users").doc(uid).get();
  if (!userDoc.exists) return NextResponse.json({ error: "user not found" }, { status: 404 });
  const data = userDoc.data() as any;

  /* Delete Firebase auth user (ignore if already gone) */
  try { await auth.deleteUser(uid); } catch {}

  /* Cascade: managed_users + username_lookup + profile + user-private docs */
  await db.collection("managed_users").doc(uid).delete();
  if (data.username) await db.collection("username_lookup").doc(data.username).delete();
  await db.collection("profiles").doc(uid).delete().catch(() => {});
  await db.collection("user_favorites").doc(uid).delete().catch(() => {});
  await db.collection("joker_usage").doc(uid).delete().catch(() => {});

  /* Cascade predictions */
  const preds = await db.collection("predictions").where("uid", "==", uid).get();
  await Promise.all(preds.docs.map(d => d.ref.delete()));

  /* Cascade group memberships */
  const mems = await db.collection("group_memberships").where("uid", "==", uid).get();
  await Promise.all(mems.docs.map(d => d.ref.delete()));

  return NextResponse.json({ ok: true });
}
