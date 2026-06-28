import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";

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

/* GET /api/admin/results — all results */
export async function GET(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const { db } = getAdmin();
  const snap = await db.collection("match_results").get();
  return NextResponse.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

/* POST /api/admin/results { matchId, home, away, winner? } — upsert
 * winner: team code of the advancing team (knockout only, e.g. "FRA").
 * Set when 90-min score is a draw and the match goes to ET/penalties.
 * isKnockout is auto-derived from the match stage. */
export async function POST(req: Request) {
  let decoded;
  try { decoded = await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const body = await req.json();
  if (!body.matchId) return NextResponse.json({ error: "missing matchId" }, { status: 400 });
  const match = MATCHES.find(m => m.id === body.matchId);
  if (!match) return NextResponse.json({ error: "match not found" }, { status: 404 });
  const home = Number(body.home);
  const away = Number(body.away);
  if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0 || home > 30 || away > 30) {
    return NextResponse.json({ error: "invalid scores" }, { status: 400 });
  }
  const isKnockout = match.stage !== "GROUP";
  /* winner: explicit team code (e.g. "FRA") — required for draws in KO;
   * auto-derived from score when one team leads. */
  const winner = isKnockout
    ? (body.winner || (home > away ? match.home : away > home ? match.away : null))
    : null;

  const { db } = getAdmin();
  const ref = db.collection("match_results").doc(body.matchId);

  /* Auto-backup: snapshot the result as it was BEFORE this edit, so it can
   * be restored later from the "עריכה ידנית" history view. Only the real
   * previous data is stored — nothing fabricated. */
  const existing = await ref.get();
  if (existing.exists) {
    await db.collection("match_results_history").add({
      ...existing.data(),
      matchId: body.matchId,
      backedUpAt: Date.now(),
      backedUpBy: decoded.email || null,
      action: "update",
    });
  }

  const docData: Record<string, any> = {
    matchId: body.matchId, home, away,
    finishedAt: body.finishedAt || Date.now(),
    sim: false,
    source: "admin",
    setByAdmin: true,
  };
  if (isKnockout) {
    docData.isKnockout = true;
    if (winner) docData.winner = winner;
  }

  await ref.set(docData, { merge: true });
  return NextResponse.json({ ok: true });
}

/* DELETE /api/admin/results { matchId } */
export async function DELETE(req: Request) {
  let decoded;
  try { decoded = await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const body = await req.json().catch(() => ({}));
  const url = new URL(req.url);
  const matchId = body.matchId || url.searchParams.get("matchId");
  if (!matchId) return NextResponse.json({ error: "missing matchId" }, { status: 400 });
  const { db } = getAdmin();
  const ref = db.collection("match_results").doc(matchId);

  /* Auto-backup the result before deleting it, so it can be restored. */
  const existing = await ref.get();
  if (existing.exists) {
    await db.collection("match_results_history").add({
      ...existing.data(),
      matchId,
      backedUpAt: Date.now(),
      backedUpBy: decoded.email || null,
      action: "delete",
    });
  }

  await ref.delete();
  return NextResponse.json({ ok: true });
}
