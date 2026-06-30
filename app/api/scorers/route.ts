import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { getScorerLeaderboards } from "@/lib/scorers-core";
export type { ScorerEntry } from "@/lib/scorers-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* The Hebrew-translation fallback below can make a live Claude API call on
 * a cache miss — without this, Vercel's default function timeout (10s on
 * many plans) could cut the request short before that call returns. */
export const maxDuration = 60;

/* =====================================================================
 * GET /api/scorers
 *
 * Returns the tournament-wide "top scorer" and "top assists" leaderboards
 * for the "מלך השערים והבישולים" tab. See lib/scorers-core.ts for the
 * aggregation + Hebrew-name-resolution logic (shared with /api/top-picks,
 * which uses the same leaderboards to mark correct one-time picks).
 *
 * ?debug=1 — diagnostic snapshot of the raw per-match goal data and the
 * Hebrew-name resolution state, without requiring admin auth (no PII —
 * this is the same player/score data already shown on the public tab).
 * ===================================================================*/
export async function GET(req: Request) {
  try {
    const debug = new URL(req.url).searchParams.get("debug") === "1";
    const { db } = getAdmin();

    /* Primary source: FIFA-scraped data (node crawl-fifa.mjs --only scorers/assists).
     * Falls back to aggregated match-event data if FIFA docs don't exist. */
    const [scorersDoc, assistsDoc] = await Promise.all([
      db.collection("live_data").doc("fifa_scorers").get(),
      db.collection("live_data").doc("fifa_assists").get(),
    ]);

    if (scorersDoc.exists && assistsDoc.exists) {
      const topScorers = scorersDoc.data()!.scorers || [];
      const topAssists = assistsDoc.data()!.assists || [];
      const out: any = { topScorers, topAssists };
      if (debug) out._source = "fifa";
      return NextResponse.json(out);
    }

    /* Fallback: aggregate from match events */
    const { topScorers, topAssists, debug: debugInfo } = await getScorerLeaderboards(db);
    const out: any = { topScorers, topAssists };
    if (debug) out._debug = debugInfo;
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
