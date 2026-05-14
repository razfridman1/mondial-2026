import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import type { StageId } from "@/lib/types";

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
 * POST /api/admin/sim/odds-weighted { stage?, overwrite? }
 *
 * Generates *realistic* random match_results using the betting odds as a
 * probability distribution. Each outcome (W/D/L) is rolled with
 * probability proportional to 1/odds. Score distribution follows a
 * mild Poisson-like sampling (favouring 0-3 goals per side).
 *
 * Knockout stages (no draws): if the roll lands on draw, redo as W/L
 * proportional to the win odds only.
 *
 * Results are tagged `sim: true` so they can be cleared by sim-reset.
 * ===================================================================*/
export async function POST(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const body = await req.json().catch(() => ({}));
  const stage: string = body.stage || "ALL";
  const overwrite: boolean = !!body.overwrite;

  let matches = MATCHES.slice();
  if (stage !== "ALL") {
    if (stage === "KNOCKOUT") {
      matches = matches.filter(m => m.stage !== "GROUP");
    } else if (ALL_STAGES.includes(stage as StageId)) {
      matches = matches.filter(m => m.stage === stage);
    }
  }

  if (!matches.length) {
    return NextResponse.json({ ok: true, inserted: 0, reason: "no matches" });
  }

  const { db } = getAdmin();
  const now = Date.now();
  let inserted = 0, skipped = 0;
  let batch = db.batch();
  let ops = 0;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const ref = db.collection("match_results").doc(m.id);
    if (!overwrite) {
      const snap = await ref.get();
      if (snap.exists) { skipped++; continue; }
    }
    const { home, away } = simulateMatch(m);

    batch.set(ref, {
      matchId: m.id,
      home, away,
      finishedAt: now - (matches.length - i) * 1000,
      sim: true,
      simKind: "odds-weighted",
    });
    ops++; inserted++;
    if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops > 0) await batch.commit();

  return NextResponse.json({ ok: true, inserted, skipped, stage });
}

/* Use odds to weight the outcome, then sample plausible scoreline */
function simulateMatch(m: any): { home: number; away: number } {
  const isKnockout = m.stage !== "GROUP";
  const odds = m.odds;

  /* Default: random plausible outcome with mild home favorite */
  let outcome: "home" | "draw" | "away";
  if (!odds || !odds.home || !odds.draw || !odds.away) {
    const r = Math.random();
    outcome = r < 0.42 ? "home" : r < 0.70 ? "away" : "draw";
  } else {
    const ih = 1 / parseFloat(odds.home);
    const id = 1 / parseFloat(odds.draw);
    const ia = 1 / parseFloat(odds.away);
    const sum = ih + id + ia;
    const pHome = ih / sum, pDraw = id / sum;
    const r = Math.random();
    if (r < pHome) outcome = "home";
    else if (r < pHome + pDraw) outcome = "draw";
    else outcome = "away";
  }

  /* In knockout — no draws (reroll proportional to win odds) */
  if (isKnockout && outcome === "draw") {
    if (odds && odds.home && odds.away) {
      const ih = 1 / parseFloat(odds.home), ia = 1 / parseFloat(odds.away);
      outcome = Math.random() < ih / (ih + ia) ? "home" : "away";
    } else {
      outcome = Math.random() < 0.5 ? "home" : "away";
    }
  }

  /* Sample a plausible score per outcome */
  function poisson(lambda: number): number {
    let L = Math.exp(-lambda), k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L && k < 10);
    return k - 1;
  }

  const winnerGoals = 1 + poisson(1.3);   /* 1-4 typical */
  const loserGoals  = Math.min(poisson(0.8), winnerGoals - 1);

  if (outcome === "home") return { home: winnerGoals, away: Math.max(0, loserGoals) };
  if (outcome === "away") return { home: Math.max(0, loserGoals), away: winnerGoals };
  /* draw — both same, 0-2 */
  const drawGoals = poisson(0.9);
  return { home: drawGoals, away: drawGoals };
}
