import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/live-scores — public live ticker for in-progress matches.
 * Returns live_data/live_scores doc: { [matchId]: { home, away,
 * minuteLabel, goals, homeCode, awayCode, updatedAt, sources } }
 *
 * Informational only — never affects match_results / predictions. The
 * actual AI lookups happen as part of runResultsSync (see
 * lib/sync-results-core.ts), which is triggered by the cron and by
 * /api/match-results' redundant-trigger path. This route just reads the
 * latest cached snapshot, so it stays cheap to poll. */
export async function GET() {
  try {
    const { db } = getAdmin();
    const snap = await db.collection("live_data").doc("live_scores").get();
    return NextResponse.json(snap.exists ? (snap.data() || {}) : {});
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
