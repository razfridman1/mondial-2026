import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/groups/rejoin  { groupId }
 * Un-leave a previously left group. Only works if the user is still
 * marked as a (left) member — i.e. they previously joined this group. */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const { groupId } = await req.json();
  if (!groupId) return NextResponse.json({ error: "missing groupId" }, { status: 400 });

  const { db } = getAdmin();
  const memId  = `${decoded.uid}_${groupId}`;
  const memRef = db.collection("group_memberships").doc(memId);
  const memSnap = await memRef.get();
  if (!memSnap.exists) return NextResponse.json({ error: "membership not found" }, { status: 404 });
  const mem = memSnap.data() as any;
  if (!mem.left) return NextResponse.json({ ok: true, alreadyActive: true });

  /* Verify the group still exists before re-adding. */
  const gRef = db.collection("groups").doc(groupId);
  const gSnap = await gRef.get();
  if (!gSnap.exists) return NextResponse.json({ error: "group no longer exists" }, { status: 404 });

  await memRef.update({ left: false, leftAt: null, rejoinedAt: Date.now() });
  const cur = (gSnap.data() as any).memberCount || 0;
  await gRef.update({ memberCount: cur + 1 });

  return NextResponse.json({ ok: true });
}
