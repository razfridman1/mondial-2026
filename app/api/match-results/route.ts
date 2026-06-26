import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { runResultsSync, isWithinActiveWindow } from "@/lib/sync-results-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* How stale live_data/sync_status.lastRunAt must be before this route
 * triggers a sync itself. Keeps the extra Firestore read + (rare) sync
 * call cheap for the vast majority of requests, while giving a backup
 * path independent of Vercel Cron (per requirement: "אם ה-cron נכשל —
 * אין מנגנון גיבוי אוטומטי מלא").
 *
 * Kept short (30s) so that final results land close to real-time —
 * comparable to /api/scorers' 60s "near real-time" client polling.
 * MatchesTab calls this endpoint every 10s while a match is live, so a
 * 30s staleness window still caps real sync calls at ~2/min — well
 * under football-data.org's free-tier rate limit. */
const STALE_MS = 30 * 1000;

/* GET /api/match-results — public list of all finished match results.
 * Returns { [matchId]: { home, away, finishedAt } } */
export async function GET() {
  try {
    const { db } = getAdmin();
    const snap = await db.collection("match_results").get();
    const out: Record<string, { home: number; away: number; finishedAt: number; winner?: string; isKnockout?: boolean }> = {};
    snap.forEach(d => {
      const data = d.data() as any;
      const entry: any = {
        home: data.home,
        away: data.away,
        finishedAt: data.finishedAt || 0,
      };
      if (data.winner)     entry.winner = data.winner;
      if (data.isKnockout) entry.isKnockout = true;
      out[d.id] = entry;
    });

    /* Redundant cron-failure backup: if a match is in its active results
     * window but the cron hasn't run recently, run the sync ourselves. */
    if (isWithinActiveWindow()) {
      try {
        const statusSnap = await db.collection("live_data").doc("sync_status").get();
        const lastRunAt = statusSnap.exists ? (statusSnap.data()?.lastRunAt || 0) : 0;
        if (Date.now() - lastRunAt > STALE_MS) {
          await runResultsSync({ force: false });
        }
      } catch {
        // best-effort only — never block the results response on this
      }
    }

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
