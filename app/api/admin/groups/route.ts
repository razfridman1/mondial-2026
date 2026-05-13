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

/* GET /api/admin/groups — list all groups with members */
export async function GET(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const { db } = getAdmin();
  const snap = await db.collection("groups").orderBy("createdAt", "desc").get();
  const out: any[] = [];
  for (const d of snap.docs) {
    const mems = await db.collection("group_memberships").where("groupId", "==", d.id).get();
    out.push({
      id: d.id,
      ...d.data(),
      members: mems.docs.map(m => m.data()),
    });
  }
  return NextResponse.json(out);
}

/* PATCH /api/admin/groups
 *   { id, name?, description?, inviteCode?, status?, welcomeMessage?, maxMembers?, isPublic? }
 *   status: "active" | "frozen" | "archive"
 */
export async function PATCH(req: Request) {
  let admin;
  try { admin = await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { db } = getAdmin();
  const patch: any = { updatedAt: Date.now(), updatedBy: admin.email };
  if (typeof body.name           === "string") patch.name           = body.name.slice(0, 60);
  if (typeof body.description    === "string") patch.description    = body.description.slice(0, 240);
  if (typeof body.welcomeMessage === "string") patch.welcomeMessage = body.welcomeMessage.slice(0, 500);
  if (typeof body.inviteCode     === "string") patch.inviteCode     = body.inviteCode.toUpperCase().slice(0, 12);
  if (typeof body.maxMembers     === "number") patch.maxMembers     = Math.max(0, Math.floor(body.maxMembers));
  if (typeof body.isPublic       === "boolean") patch.isPublic      = body.isPublic;
  if (body.status === "active" || body.status === "frozen" || body.status === "archive") {
    patch.status = body.status;
  }
  if (Object.keys(patch).length <= 2) return NextResponse.json({ error: "nothing to patch" }, { status: 400 });
  await db.collection("groups").doc(body.id).set(patch, { merge: true });
  return NextResponse.json({ ok: true });
}

/* DELETE /api/admin/groups
 *   { id }                        — nuke group + memberships
 *   { id, removeMemberUid }       — remove one member from the group
 */
export async function DELETE(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const body = await req.json();
  const id = body.id;
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { db } = getAdmin();

  /* Per-member removal */
  if (body.removeMemberUid) {
    const memId = `${body.removeMemberUid}_${id}`;
    const memRef = db.collection("group_memberships").doc(memId);
    const memSnap = await memRef.get();
    if (!memSnap.exists) return NextResponse.json({ ok: true, alreadyRemoved: true });
    await memRef.delete();
    const gRef = db.collection("groups").doc(id);
    const gSnap = await gRef.get();
    if (gSnap.exists) {
      const cur = (gSnap.data() as any).memberCount || 1;
      await gRef.update({ memberCount: Math.max(0, cur - 1) });
    }
    return NextResponse.json({ ok: true, removedMember: body.removeMemberUid });
  }

  /* Full group deletion */
  await db.collection("groups").doc(id).delete();
  const mems = await db.collection("group_memberships").where("groupId", "==", id).get();
  await Promise.all(mems.docs.map(d => d.ref.delete()));
  return NextResponse.json({ ok: true, removedMembers: mems.size });
}
