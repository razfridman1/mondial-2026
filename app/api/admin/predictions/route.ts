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

/* GET /api/admin/predictions?uid=&matchId=  — flexible filter */
export async function GET(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const url = new URL(req.url);
  const uid = url.searchParams.get("uid");
  const matchId = url.searchParams.get("matchId");
  const { db } = getAdmin();
  let q: FirebaseFirestore.Query = db.collection("predictions");
  if (uid)     q = q.where("uid", "==", uid);
  if (matchId) q = q.where("matchId", "==", matchId);
  const snap = await q.get();
  return NextResponse.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

/* POST /api/admin/predictions { uid, matchId, homeScore, awayScore, predictedWinner? }
 * Upsert — creates the prediction if it doesn't exist yet, or updates it if
 * it does. Bypasses the normal 3-minute-before-kickoff lock entirely (and
 * works even after the match has finished) — used by the super-admin
 * bypass/impersonation controls in "ניחושי השבוע". */
export async function POST(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const body = await req.json().catch(() => ({}));
  const { uid, matchId, homeScore, awayScore, predictedWinner } = body;
  if (!uid || !matchId) return NextResponse.json({ error: "missing uid/matchId" }, { status: 400 });
  const h = Number(homeScore);
  const a = Number(awayScore);
  if (!Number.isFinite(h) || !Number.isFinite(a) || h < 0 || a < 0 || h > 20 || a > 20) {
    return NextResponse.json({ error: "invalid scores" }, { status: 400 });
  }
  const { db } = getAdmin();
  const docId = `${uid}_${matchId}`;
  const payload: any = {
    uid, matchId,
    homeScore: h, awayScore: a,
    joker: false,
    auto: false,
    editedByAdmin: true,
    updatedAt: Date.now(),
  };
  if (typeof predictedWinner === "string" && predictedWinner.trim()) payload.predictedWinner = predictedWinner.trim();
  await db.collection("predictions").doc(docId).set(payload, { merge: true });
  return NextResponse.json({ ok: true, id: docId, ...payload });
}

/* PATCH /api/admin/predictions { id, homeScore?, awayScore?, joker? } — edit */
export async function PATCH(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { db } = getAdmin();
  const patch: any = { updatedAt: Date.now(), editedByAdmin: true };
  if (Number.isFinite(Number(body.homeScore))) patch.homeScore = Number(body.homeScore);
  if (Number.isFinite(Number(body.awayScore))) patch.awayScore = Number(body.awayScore);
  if (typeof body.joker === "boolean")          patch.joker = body.joker;
  /* When the admin explicitly sets scores, clear the auto-filled flag so
   * the prediction appears as if the user filled it themselves. */
  if (patch.homeScore != null || patch.awayScore != null) patch.auto = false;
  await db.collection("predictions").doc(body.id).set(patch, { merge: true });
  return NextResponse.json({ ok: true });
}

/* DELETE /api/admin/predictions { id?, uid?, matchId? } — single or bulk */
export async function DELETE(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const body = await req.json().catch(() => ({}));
  const { db } = getAdmin();
  if (body.id) {
    await db.collection("predictions").doc(body.id).delete();
    return NextResponse.json({ ok: true, deleted: 1 });
  }
  // bulk
  let q: FirebaseFirestore.Query = db.collection("predictions");
  if (body.uid)     q = q.where("uid", "==", body.uid);
  if (body.matchId) q = q.where("matchId", "==", body.matchId);
  if (!body.uid && !body.matchId) return NextResponse.json({ error: "specify id/uid/matchId" }, { status: 400 });
  const snap = await q.get();
  await Promise.all(snap.docs.map(d => d.ref.delete()));
  return NextResponse.json({ ok: true, deleted: snap.size });
}
