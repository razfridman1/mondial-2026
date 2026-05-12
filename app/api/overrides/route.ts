import { NextResponse } from "next/server";
import { getAdmin, isAdminEmail, verifyIdToken } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";


async function authedAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const decoded = await verifyIdToken(m[1]);
  if (!isAdminEmail(decoded.email)) throw Object.assign(new Error("forbidden"), { status: 403 });
  return decoded;
}

export async function GET() {
  const { db } = getAdmin();
  const snap = await db.collection("broadcast_overrides").get();
  const map: Record<string, any> = {};
  snap.forEach(d => { map[d.id] = d.data(); });
  return NextResponse.json(map);
}

export async function POST(req: Request) {
  let user;
  try { user = await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const body = await req.json();
  const { matchId, utc, channels, studioShow, status, reason } = body;
  if (!matchId) return NextResponse.json({ error: "missing matchId" }, { status: 400 });

  const { db } = getAdmin();
  await db.collection("broadcast_overrides").doc(matchId).set({
    matchId,
    ...(utc        !== undefined ? { utc } : {}),
    ...(channels   !== undefined ? { channels } : {}),
    ...(studioShow !== undefined ? { studioShow } : {}),
    ...(status     !== undefined ? { status } : {}),
    ...(reason     !== undefined ? { reason } : {}),
    setByUid: user.uid,
    setByEmail: user.email,
    setAt: Date.now(),
  }, { merge: true });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const body = await req.json();
  if (!body.matchId) return NextResponse.json({ error: "missing matchId" }, { status: 400 });
  const { db } = getAdmin();
  await db.collection("broadcast_overrides").doc(body.matchId).delete();
  return NextResponse.json({ ok: true });
}
