import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/groups/mine
 *   ?includeLeft=true → return both active and soft-left memberships
 *   default            → return only active (left !== true) memberships
 * Each group is augmented with `_left: boolean` so the client can split
 * them into active vs left lists.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const url = new URL(req.url);
  const includeLeft = url.searchParams.get("includeLeft") === "true";

  const { db } = getAdmin();
  const memSnap = await db.collection("group_memberships").where("uid", "==", decoded.uid).get();
  const memberships = memSnap.docs.map(d => {
    const data = d.data() as any;
    return { groupId: data.groupId as string, left: !!data.left };
  });
  const filtered = includeLeft ? memberships : memberships.filter(m => !m.left);
  if (!filtered.length) return NextResponse.json([]);

  const groups = await Promise.all(filtered.map(async (mem) => {
    const g = await db.collection("groups").doc(mem.groupId).get();
    return g.exists ? { id: g.id, ...(g.data() as any), _left: mem.left } : null;
  }));
  return NextResponse.json(groups.filter(Boolean));
}
