import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import { effectiveUtc, type SimConfig } from "@/lib/sim";
import { backupPrediction, snapshotPredictionsToBackup } from "@/lib/predictions-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const uid = url.searchParams.get("uid");
  if (!uid) return NextResponse.json([], { status: 200 });
  const { db } = getAdmin();
  const snap = await db.collection("predictions").where("uid", "==", uid).get();
  const out = snap.docs.map(d => d.data());
  return NextResponse.json(out);
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const body = await req.json();
  const { matchId, homeScore, awayScore, predictedWinner } = body;
  const match = MATCHES.find(x => x.id === matchId);
  if (!match) return NextResponse.json({ error: "match not found" }, { status: 404 });

  const { db } = getAdmin();
  const simSnap = await db.collection("sim_config").doc("global").get();
  const sim = simSnap.exists ? (simSnap.data() as SimConfig) : null;
  const effectiveStart = new Date(effectiveUtc(match.utc, sim)).getTime();
  if (Date.now() >= effectiveStart - 3 * 60 * 1000) {
    return NextResponse.json({ error: "locked", message: "הניחוש נעול — לא ניתן לעדכן יותר" }, { status: 403 });
  }

  const h = Number(homeScore);
  const a = Number(awayScore);
  if (!Number.isFinite(h) || !Number.isFinite(a) || h < 0 || a < 0 || h > 20 || a > 20) {
    return NextResponse.json({ error: "invalid scores" }, { status: 400 });
  }

  const docId = `${decoded.uid}_${matchId}`;
  /* For knockout matches we also store a predictedWinner (team code). When
   * the 90-min score isn't a tie, the winner is unambiguous so we derive
   * from the score; otherwise the client must send a valid team code. */
  const isKO = match.stage !== "GROUP";
  let pw: string | null = null;
  if (isKO) {
    if (h > a)      pw = match.home;
    else if (a > h) pw = match.away;
    else if (typeof predictedWinner === "string" && predictedWinner.trim()) {
      pw = predictedWinner.trim();
    }
  }
  const payload: any = {
    uid: decoded.uid, matchId,
    homeScore: h, awayScore: a,
    joker: false,
    updatedAt: Date.now(),
  };
  if (pw) payload.predictedWinner = pw;
  await db.collection("predictions").doc(docId).set(payload, { merge: true });

  /* Mirror to predictions_backup. Best-effort: a backup failure must not
   * fail the save itself. */
  try { await backupPrediction(payload, "save"); }
  catch (e) { console.warn("[predictions] backup failed:", e); }

  return NextResponse.json({ ok: true, joker: false });
}

/* ===================================================================
 * DELETE /api/predictions  { matchId?, stage? }
 *
 * Deletes the caller's own prediction(s). Always enforces the same
 * 3-minute-before-kickoff lock as POST.
 *   - matchId: delete one prediction (404 if not found, 403 if locked)
 *   - stage:   delete every prediction the user has for matches in that
 *              stage that aren't yet locked. Returns counts of deleted
 *              and skipped (locked).
 * Either matchId or stage is required.
 * =================================================================== */
export async function DELETE(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const url = new URL(req.url);
  const matchId = url.searchParams.get("matchId");
  const stage   = url.searchParams.get("stage");
  if (!matchId && !stage) {
    return NextResponse.json({ error: "missing matchId or stage" }, { status: 400 });
  }

  const { db } = getAdmin();
  const simSnap = await db.collection("sim_config").doc("global").get();
  const sim = simSnap.exists ? (simSnap.data() as SimConfig) : null;

  function isLocked(matchUtc: string): boolean {
    const eff = new Date(effectiveUtc(matchUtc, sim)).getTime();
    return Date.now() >= eff - 3 * 60 * 1000;
  }

  /* Single-match path */
  if (matchId) {
    const match = MATCHES.find(x => x.id === matchId);
    if (!match) return NextResponse.json({ error: "match not found" }, { status: 404 });
    if (isLocked(match.utc)) {
      return NextResponse.json({
        error: "locked",
        message: "הניחוש נעול — לא ניתן למחוק (תוך 3 דקות לפני המשחק או אחרי)",
      }, { status: 403 });
    }
    const docId = `${decoded.uid}_${matchId}`;
    /* Pre-delete snapshot: ensure the latest state is in backup. */
    const liveSnap = await db.collection("predictions").doc(docId).get();
    if (liveSnap.exists) {
      try { await snapshotPredictionsToBackup([liveSnap.data() as any], "pre-delete-single"); }
      catch (e) { console.warn("[predictions] pre-delete backup failed:", e); }
    }
    await db.collection("predictions").doc(docId).delete();
    return NextResponse.json({ ok: true, deleted: 1 });
  }

  /* Stage path: delete predictions for matches in stage that are not locked. */
  const stageMatches = MATCHES.filter(m => m.stage === stage);
  if (!stageMatches.length) return NextResponse.json({ error: "invalid stage" }, { status: 400 });

  let deleted = 0, lockedCount = 0;
  let batch = db.batch();
  let ops = 0;
  const toBackup: any[] = [];
  for (const m of stageMatches) {
    if (isLocked(m.utc)) { lockedCount++; continue; }
    const ref = db.collection("predictions").doc(`${decoded.uid}_${m.id}`);
    const snap = await ref.get();
    if (!snap.exists) continue;
    toBackup.push(snap.data());
    batch.delete(ref);
    deleted++;
    ops++;
    if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops > 0) await batch.commit();
  /* Pre-delete snapshot to backup (best-effort, after live delete succeeded
   * we still write to backup because backup already has these from saves;
   * we just refresh the deletedAt marker). */
  if (toBackup.length) {
    try { await snapshotPredictionsToBackup(toBackup, "pre-delete-stage"); }
    catch (e) { console.warn("[predictions] stage-delete backup failed:", e); }
  }

  return NextResponse.json({ ok: true, deleted, locked: lockedCount });
}
