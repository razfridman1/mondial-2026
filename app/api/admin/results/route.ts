import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";

export const runtime = "nodejs";

async function authedAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const decoded = await verifyIdToken(m[1]);
  if (!isAdminEmail(decoded.email)) throw Object.assign(new Error("forbidden"), { status: 403 });
  return decoded;
}

/* GET /api/admin/results — all results */
export async function GET(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const { db } = getAdmin();
  const snap = await db.collection("match_results").get();
  return NextResponse.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

/* POST /api/admin/results { matchId, home, away } — upsert */
export async function POST(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const body = await req.json();
  if (!body.matchId) return NextResponse.json({ error: "missing matchId" }, { status: 400 });
  if (!MATCHES.find(m => m.id === body.matchId)) return NextResponse.json({ error: "match not found" }, { status: 404 });
  const home = Number(body.home);
  const away = Number(body.away);
  if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0 || home > 30 || away > 30) {
    return NextResponse.json({ error: "invalid scores" }, { status: 400 });
  }
  const { db } = getAdmin();
  await db.collection("match_results").doc(body.matchId).set({
    matchId: body.matchId, home, away,
    finishedAt: body.finishedAt || Date.now(),
    sim: false,
    setByAdmin: true,
  }, { merge: true });
  return NextResponse.json({ ok: true });
}

/* DELETE /api/admin/results { matchId } */
export async function DELETE(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const body = await req.json().catch(() => ({}));
  const url = new URL(req.url);
  const matchId = body.matchId || url.searchParams.get("matchId");
  if (!matchId) return NextResponse.json({ error: "missing matchId" }, { status: 400 });
  const { db } = getAdmin();
  await db.collection("match_results").doc(matchId).delete();
  return NextResponse.json({ ok: true });
}
