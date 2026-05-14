import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import type { StageId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* =====================================================================
 * POST /api/admin/sim/clear-stage  { stage, groupId? }
 *
 * Clears all simulation data scoped to ONE tournament stage:
 *   • match_results docs for matches in that stage (sim:true only —
 *     real results entered manually are preserved)
 *   • predictions for matches in that stage (filtered to the supplied
 *     groupId's members when provided; otherwise across all users)
 *
 * Returns counts of what was deleted.
 * ===================================================================*/
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  if (!isAdminEmail(decoded.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const stage: StageId | undefined = body.stage;
  const groupId: string | undefined = body.groupId;
  if (!stage) return NextResponse.json({ error: "missing stage" }, { status: 400 });

  const stageMatches = MATCHES.filter(mm => mm.stage === stage);
  if (!stageMatches.length) {
    return NextResponse.json({ error: "no matches in stage" }, { status: 400 });
  }
  const stageMatchIds = stageMatches.map(mm => mm.id);

  const { db } = getAdmin();

  /* ---------- 1. Delete sim:true match_results for stage ---------- */
  let deletedResults = 0;
  /* Firestore "in" caps at 30 — chunk match IDs. */
  for (let i = 0; i < stageMatchIds.length; i += 30) {
    const chunk = stageMatchIds.slice(i, i + 30);
    const snap = await db.collection("match_results")
      .where("matchId", "in", chunk)
      .get();
    let batch = db.batch();
    let ops = 0;
    for (const d of snap.docs) {
      const data = d.data() as any;
      /* Skip real results — only delete sim-generated. */
      if (!data.sim) continue;
      batch.delete(d.ref);
      deletedResults++;
      ops++;
      if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();
  }
  /* Fallback for results whose docs predate the matchId field — also
   * try direct doc IDs. */
  let batch = db.batch();
  let ops = 0;
  for (const id of stageMatchIds) {
    const ref = db.collection("match_results").doc(id);
    const snap = await ref.get();
    if (snap.exists && (snap.data() as any).sim) {
      batch.delete(ref);
      deletedResults++; ops++;
      if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
  }
  if (ops > 0) await batch.commit();

  /* ---------- 2. Delete predictions for matches in stage ---------- */
  let deletedPredictions = 0;
  let uids: string[] | null = null;
  if (groupId) {
    const memSnap = await db.collection("group_memberships").where("groupId", "==", groupId).get();
    uids = memSnap.docs
      .filter(d => !(d.data() as any).left)
      .map(d => (d.data() as any).uid as string);
  }

  if (uids) {
    /* Per-group: only this group's members. Build (uid_matchId) keys and
     * delete by doc reference directly — fast and bypasses query limits. */
    let pbatch = db.batch();
    let pops = 0;
    for (const uid of uids) {
      for (const mid of stageMatchIds) {
        const ref = db.collection("predictions").doc(`${uid}_${mid}`);
        const snap = await ref.get();
        if (!snap.exists) continue;
        pbatch.delete(ref);
        deletedPredictions++;
        pops++;
        if (pops >= 450) { await pbatch.commit(); pbatch = db.batch(); pops = 0; }
      }
    }
    if (pops > 0) await pbatch.commit();
  } else {
    /* No group filter → delete across the whole system. */
    for (let i = 0; i < stageMatchIds.length; i += 30) {
      const chunk = stageMatchIds.slice(i, i + 30);
      const snap = await db.collection("predictions").where("matchId", "in", chunk).get();
      let pbatch = db.batch();
      let pops = 0;
      for (const d of snap.docs) {
        pbatch.delete(d.ref);
        deletedPredictions++;
        pops++;
        if (pops >= 450) { await pbatch.commit(); pbatch = db.batch(); pops = 0; }
      }
      if (pops > 0) await pbatch.commit();
    }
  }

  return NextResponse.json({ ok: true, stage, deletedResults, deletedPredictions, groupScoped: !!groupId });
}
