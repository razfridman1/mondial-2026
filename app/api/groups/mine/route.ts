import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const { db } = getAdmin();
  const memSnap = await db.collection("group_memberships").where("uid", "==", decoded.uid).get();
  const groupIds = memSnap.docs.map(d => d.data().groupId as string);
  if (!groupIds.length) return NextResponse.json([]);
  const groups = await Promise.all(groupIds.map(async (id) => {
    const g = await db.collection("groups").doc(id).get();
    return g.exists ? { id: g.id, ...g.data() } : null;
  }));
  return NextResponse.json(groups.filter(Boolean));
}
