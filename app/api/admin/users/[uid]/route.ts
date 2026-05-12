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

export async function PATCH(req: Request, ctx: { params: { uid: string } }) {
  let admin;
  try { admin = await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const uid = ctx.params.uid;
  const { auth, db } = getAdmin();
  const body = await req.json();

  const userDoc = await db.collection("managed_users").doc(uid).get();
  if (!userDoc.exists) return NextResponse.json({ error: "user not found" }, { status: 404 });

  const updates: any = { updatedAt: Date.now(), updatedBy: admin.email };

  if (typeof body.displayName === "string" && body.displayName.length) {
    updates.displayName = body.displayName.slice(0, 60);
    await auth.updateUser(uid, { displayName: updates.displayName });
    await db.collection("profiles").doc(uid).set({ displayName: updates.displayName }, { merge: true });
  }
  if (body.role === "admin" || body.role === "user") {
    updates.role = body.role;
    await db.collection("username_lookup").doc(userDoc.data()!.username).set({ role: body.role }, { merge: true });
  }
  if (typeof body.disabled === "boolean") {
    updates.disabled = body.disabled;
    await auth.updateUser(uid, { disabled: body.disabled });
  }
  if (typeof body.password === "string" && body.password.length >= 6) {
    await auth.updateUser(uid, { password: body.password });
    updates.passwordResetAt = Date.now();
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
  await db.collection("user_reminders").doc(uid).delete().catch(() => {});
  await db.collection("email_prefs").doc(uid).delete().catch(() => {});
  await db.collection("joker_usage").doc(uid).delete().catch(() => {});

  /* Cascade predictions */
  const preds = await db.collection("predictions").where("uid", "==", uid).get();
  await Promise.all(preds.docs.map(d => d.ref.delete()));

  /* Cascade group memberships */
  const mems = await db.collection("group_memberships").where("uid", "==", uid).get();
  await Promise.all(mems.docs.map(d => d.ref.delete()));

  return NextResponse.json({ ok: true });
}
