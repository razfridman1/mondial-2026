import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { MATCHES, TEAMS } from "@/lib/data";
import type { StageId, Match } from "@/lib/types";
import { resolvePlaceholder, resolveAllStages, stageComplete, groupStageComplete } from "@/lib/bracket";
import type { MatchResult } from "@/lib/standings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authedAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const decoded = await verifyIdToken(m[1]);
  if (!isAdminEmail(decoded.email)) throw Object.assign(new Error("forbidden"), { status: 403 });
  return decoded;
}

const ALL_STAGES: StageId[] = ["GROUP", "R32", "R16", "QF", "SF", "THIRD", "FINAL"];

/* =====================================================================
 * POST /api/admin/sim/instant-results { stage?, overwrite? }
 *
 * Generates FIFA-rule-based results for the requested stage:
 *   - GROUP   → realistic odds-weighted random results
 *   - Knockouts → resolves placeholders to actual teams from previous-stage
 *                 standings, then generates a winner (no draws in knockouts).
 *
 * Each non-group stage requires the previous stage to be completed first.
 * Returns 400 if missing prerequisite stage results.
 *
 * Results are tagged `sim: true` so they can be cleared via DELETE.
 * ===================================================================*/
export async function POST(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const body = await req.json().catch(() => ({}));
  const stage: string = body.stage || "ALL";
  const overwrite: boolean = !!body.overwrite;

  const { db } = getAdmin();

  /* Load existing results into memory — needed to resolve placeholders */
  const resSnap = await db.collection("match_results").get();
  const results: Record<string, MatchResult> = {};
  resSnap.forEach(d => {
    const data = d.data() as any;
    results[d.id] = { home: data.home, away: data.away, finishedAt: data.finishedAt || 0 };
  });

  /* Validate prerequisites for non-group stages */
  if (stage !== "ALL" && stage !== "GROUP") {
    const PREV: Record<string, StageId> = {
      R32: "GROUP", R16: "R32", QF: "R16", SF: "QF", THIRD: "SF", FINAL: "SF",
    };
    const prev = PREV[stage];
    if (prev && !stageComplete(prev, results)) {
      return NextResponse.json({
        error: "prerequisite_missing",
        message: `קודם יש למלא תוצאות לשלב הקודם (${prev}). חזור והרץ "צור תוצאות מיידיות" עליו תחילה.`,
      }, { status: 400 });
    }
  }

  /* Resolve the bracket once based on the current results — used to map
   * placeholder strings to actual team codes for knockouts. */
  const resolved = resolveAllStages(results);

  /* Pick the matches we're going to simulate */
  let matches: Match[];
  if (stage === "ALL") {
    /* For ALL, we must do it stage-by-stage in order so that each
     * subsequent stage sees the previous stage's results. */
    return simulateInOrder(db, results, overwrite);
  }
  if (stage === "KNOCKOUT") {
    matches = MATCHES.filter(m => m.stage !== "GROUP");
  } else if (ALL_STAGES.includes(stage as StageId)) {
    matches = MATCHES.filter(m => m.stage === stage);
  } else {
    return NextResponse.json({ error: "invalid stage" }, { status: 400 });
  }

  return simulateBatch(db, matches, results, resolved, overwrite, stage);
}

/* ----------------------------------------------------------------------
 * For "ALL": simulate stage by stage, re-resolving after each.
 * ----------------------------------------------------------------------*/
async function simulateInOrder(db: FirebaseFirestore.Firestore, results: Record<string, MatchResult>, overwrite: boolean) {
  const ORDER: StageId[] = ["GROUP", "R32", "R16", "QF", "SF", "THIRD", "FINAL"];
  let totalInserted = 0;
  let totalSkipped = 0;
  let resolved = resolveAllStages(results);

  for (const st of ORDER) {
    const ms = MATCHES.filter(m => m.stage === st);
    const res = await simulateBatch(db, ms, results, resolved, overwrite, st);
    /* simulateBatch updates `results` and returns response */
    const data = await res.json();
    totalInserted += data.inserted || 0;
    totalSkipped  += data.skipped  || 0;
    /* After this stage finishes, re-resolve so the next stage's
     * placeholders use the new results. */
    resolved = resolveAllStages(results);
  }

  return NextResponse.json({ ok: true, inserted: totalInserted, skipped: totalSkipped, stage: "ALL" });
}

/* ----------------------------------------------------------------------
 * Simulate a batch of matches in a single stage.
 * Mutates `results` in place so callers can continue with updated state.
 * ----------------------------------------------------------------------*/
async function simulateBatch(
  db: FirebaseFirestore.Firestore,
  matches: Match[],
  results: Record<string, MatchResult>,
  resolved: ReturnType<typeof resolveAllStages>,
  overwrite: boolean,
  stage: string,
) {
  const now = Date.now();
  let inserted = 0, skipped = 0;
  let batch = db.batch();
  let ops = 0;
  /* Track teams already assigned within this stage so the same 3rd-placed
   * team can't end up in two different R32 slots. */
  const usedTeams = new Set<string>();

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const ref = db.collection("match_results").doc(m.id);

    if (!overwrite) {
      const snap = await ref.get();
      if (snap.exists) { skipped++; continue; }
    }

    /* For knockouts, resolve teams; for group stage, use as-is */
    const isKO = m.stage !== "GROUP";
    let homeCode = m.home;
    let awayCode = m.away;
    if (isKO) {
      homeCode = resolvePlaceholder(m.home, results, resolved, usedTeams) || m.home;
      awayCode = resolvePlaceholder(m.away, results, resolved, usedTeams) || m.away;
    }

    const { home, away } = simulateMatch(m, homeCode, awayCode, isKO);
    const finishedAt = now - (matches.length - i) * 1000;

    const doc: any = {
      matchId: m.id,
      home, away,
      finishedAt,
      sim: true,
      simKind: "fifa-rules",
    };
    /* Store resolved teams for KO matches so display can show actual names */
    if (isKO) {
      doc.homeTeam = homeCode;
      doc.awayTeam = awayCode;
    }
    batch.set(ref, doc);
    /* Update in-memory results so subsequent matches in this batch can resolve correctly */
    results[m.id] = { home, away, finishedAt };
    /* Also update resolved table for KO winner propagation within batch */
    if (isKO) {
      let winner = "", loser = "";
      if (home > away) { winner = homeCode; loser = awayCode; }
      else if (home < away) { winner = awayCode; loser = homeCode; }
      else {
        /* Tie in KO — pick deterministically. (We avoid ties in simulateMatch but just in case.) */
        winner = homeCode; loser = awayCode;
      }
      resolved[m.id] = { home: homeCode, away: awayCode, winner, loser };
    }

    ops++; inserted++;
    if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops > 0) await batch.commit();

  return NextResponse.json({ ok: true, inserted, skipped, stage });
}

/* ----------------------------------------------------------------------
 * Generate realistic score for one match.
 * For knockouts → no draws (reroll).
 * Uses odds when available; otherwise mild home advantage.
 * ----------------------------------------------------------------------*/
function simulateMatch(m: Match, homeCode: string, awayCode: string, isKnockout: boolean): { home: number; away: number } {
  const odds = m.odds;
  let outcome: "home" | "draw" | "away";
  if (odds && odds.home && odds.draw && odds.away) {
    const ih = 1 / parseFloat(odds.home);
    const id = 1 / parseFloat(odds.draw);
    const ia = 1 / parseFloat(odds.away);
    const sum = ih + id + ia;
    const r = Math.random();
    if (r < ih / sum) outcome = "home";
    else if (r < (ih + id) / sum) outcome = "draw";
    else outcome = "away";
  } else {
    const r = Math.random();
    outcome = r < 0.42 ? "home" : r < 0.70 ? "away" : "draw";
  }

  /* Knockouts must have a winner — reroll draws */
  if (isKnockout && outcome === "draw") {
    if (odds && odds.home && odds.away) {
      const ih = 1 / parseFloat(odds.home), ia = 1 / parseFloat(odds.away);
      outcome = Math.random() < ih / (ih + ia) ? "home" : "away";
    } else {
      outcome = Math.random() < 0.5 ? "home" : "away";
    }
  }

  function poisson(lambda: number): number {
    let L = Math.exp(-lambda), k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L && k < 10);
    return k - 1;
  }
  const winnerGoals = 1 + poisson(1.3);
  const loserGoals  = Math.max(0, Math.min(poisson(0.8), winnerGoals - 1));

  if (outcome === "home") return { home: winnerGoals, away: loserGoals };
  if (outcome === "away") return { home: loserGoals, away: winnerGoals };
  const draw = poisson(0.9);
  return { home: draw, away: draw };
}

/* =====================================================================
 * DELETE /api/admin/sim/instant-results { stage?, force? }
 * (Unchanged from previous version — only deletes sim:true results.)
 * ===================================================================*/
export async function DELETE(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const body = await req.json().catch(() => ({}));
  const stage: string = body.stage || "ALL";
  const force: boolean = !!body.force;

  const { db } = getAdmin();
  let matchIds: string[] | null = null;
  if (stage !== "ALL") {
    let ms = MATCHES.slice();
    if (stage === "KNOCKOUT") ms = ms.filter(m => m.stage !== "GROUP");
    else if (ALL_STAGES.includes(stage as StageId)) ms = ms.filter(m => m.stage === stage);
    else return NextResponse.json({ error: "invalid stage" }, { status: 400 });
    matchIds = ms.map(m => m.id);
  }

  let deleted = 0;
  let skippedReal = 0;
  if (matchIds) {
    for (const id of matchIds) {
      const ref = db.collection("match_results").doc(id);
      const snap = await ref.get();
      if (!snap.exists) continue;
      const data = snap.data() as any;
      if (!force && data?.sim !== true) { skippedReal++; continue; }
      await ref.delete().catch(() => {});
      deleted++;
    }
  } else {
    const q = force ? db.collection("match_results") : db.collection("match_results").where("sim", "==", true);
    const snap = await q.get();
    let batch = db.batch();
    let ops = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      ops++; deleted++;
      if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();
  }

  return NextResponse.json({ ok: true, deleted, skippedReal, stage });
}
