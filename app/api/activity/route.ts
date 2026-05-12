import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/activity?groupId=...&limit=50  */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId");
  const limit = Math.min(100, Number(url.searchParams.get("limit") || 50));

  const { db } = getAdmin();
  let q = db.collection("activity").orderBy("ts", "desc").limit(limit);
  if (groupId) q = db.collection("activity").where("groupId", "==", groupId).orderBy("ts", "desc").limit(limit);
  const snap = await q.get();
  return NextResponse.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

/* POST /api/activity  { kind, payload?, groupId?, matchId? } */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  const body = await req.json();
  const { db } = getAdmin();
  const profileSnap = await db.collection("profiles").doc(decoded.uid).get();
  const profile: any = profileSnap.data() || {};
  await db.collection("activity").add({
    kind: body.kind || "user.reaction",
    uid: decoded.uid,
    displayName: profile.displayName || decoded.email,
    avatarId: profile.avatarId || "messi",
    groupId: body.groupId || null,
    matchId: body.matchId || null,
    payload: body.payload || {},
    ts: Date.now(),
  });
  return NextResponse.json({ ok: true });
}
