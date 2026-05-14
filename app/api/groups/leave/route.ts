import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/groups/leave  { groupId }
 * Soft-leave the group. Sets membership.left=true and decrements the
 * group memberCount. The membership row is preserved so the user can
 * rejoin (via /api/groups/rejoin) without an invite code. */
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
  if (!memSnap.exists) return NextResponse.json({ error: "not a member" }, { status: 404 });
  const mem = memSnap.data() as any;
  if (mem.left) return NextResponse.json({ ok: true, alreadyLeft: true });

  await memRef.update({ left: true, leftAt: Date.now() });

  /* Decrement memberCount (clamped at 0). */
  const gRef = db.collection("groups").doc(groupId);
  const gSnap = await gRef.get();
  if (gSnap.exists) {
    const cur = (gSnap.data() as any).memberCount || 1;
    await gRef.update({ memberCount: Math.max(0, cur - 1) });
  }

  return NextResponse.json({ ok: true });
}
