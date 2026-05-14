import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* DELETE /api/groups/[id]
 * Delete the group entirely. Owner only AND only allowed when the
 * group has a single ACTIVE member (the owner themselves) — i.e. no
 * other living members. This protects users who joined the group.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const groupId = params.id;
  const { db } = getAdmin();
  const gRef = db.collection("groups").doc(groupId);
  const gSnap = await gRef.get();
  if (!gSnap.exists) return NextResponse.json({ error: "group not found" }, { status: 404 });
  const g = gSnap.data() as any;
  if (g.ownerUid !== decoded.uid) {
    return NextResponse.json({ error: "only the group owner can delete this group" }, { status: 403 });
  }

  /* Verify only ONE active member exists (the owner). */
  const memsSnap = await db.collection("group_memberships").where("groupId", "==", groupId).get();
  const activeMembers = memsSnap.docs.filter(d => !(d.data() as any).left);
  if (activeMembers.length > 1) {
    return NextResponse.json({
      error: "cannot delete — there are other members in the group",
      activeCount: activeMembers.length,
    }, { status: 409 });
  }

  /* Delete the group + ALL membership rows (active + left). */
  let batch = db.batch();
  let ops = 0;
  for (const d of memsSnap.docs) {
    batch.delete(d.ref); ops++;
    if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  batch.delete(gRef);
  await batch.commit();

  return NextResponse.json({ ok: true });
}
