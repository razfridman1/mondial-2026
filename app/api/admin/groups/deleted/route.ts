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

/* GET /api/admin/groups/deleted — list deleted-group snapshots, newest first */
export async function GET(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const { db } = getAdmin();
  const snap = await db.collection("deleted_groups").orderBy("deletedAt", "desc").get();
  return NextResponse.json(snap.docs.map(d => d.data()));
}

/* POST /api/admin/groups/deleted  { id }
 * Restore a deleted group exactly as it was: recreates the group doc with
 * its original ID + data, and recreates every membership doc it had.
 */
export async function POST(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { db } = getAdmin();

  const snapRef = db.collection("deleted_groups").doc(id);
  const snap = await snapRef.get();
  if (!snap.exists) return NextResponse.json({ error: "not found" }, { status: 404 });
  const data = snap.data() as any;

  /* Don't clobber a group that already exists with this id */
  const existing = await db.collection("groups").doc(id).get();
  if (existing.exists) {
    return NextResponse.json({ error: "a group with this id already exists — cannot restore" }, { status: 409 });
  }

  await db.collection("groups").doc(id).set(data.group || {});
  for (const mem of (data.memberships || [])) {
    const { docId, ...rest } = mem;
    if (docId) await db.collection("group_memberships").doc(docId).set(rest);
  }

  await snapRef.delete();
  return NextResponse.json({ ok: true, restoredMembers: (data.memberships || []).length });
}

/* DELETE /api/admin/groups/deleted  { id }
 * Permanently purge a deleted-group snapshot (cannot be restored afterwards).
 */
export async function DELETE(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { db } = getAdmin();
  await db.collection("deleted_groups").doc(id).delete();
  return NextResponse.json({ ok: true });
}
