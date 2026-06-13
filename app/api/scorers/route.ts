import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import type { ExternalGoal } from "@/lib/football-data-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================================
 * GET /api/scorers
 *
 * Aggregates the structured goal/assist data persisted by
 * /api/cron/sync-results (Firestore live_data/match_goals — written per
 * finished match as { goals: ExternalGoal[], homeCode, awayCode }) into
 * tournament-wide "top scorer" and "top assists" leaderboards, used by the
 * "מלך השערים והבישולים" tab.
 *
 * Ranking: descending by count; ties broken alphabetically by player name
 * (Hebrew/English as provided by the source — no extra info is fabricated).
 * Own goals (type === "OWN") are excluded from both leaderboards.
 * ===================================================================*/
export interface ScorerEntry {
  name: string;
  teamCode: string | null;
  count: number;
}

export async function GET() {
  try {
    const { db } = getAdmin();
    const snap = await db.collection("live_data").doc("match_goals").get();
    const data: Record<string, { goals?: ExternalGoal[]; homeCode?: string; awayCode?: string }> =
      snap.exists ? (snap.data() || {}) : {};

    const scorers = new Map<string, ScorerEntry>();
    const assists = new Map<string, ScorerEntry>();

    for (const match of Object.values(data)) {
      for (const g of match.goals || []) {
        if (!g || g.type === "OWN") continue; // own goals don't count toward either leaderboard

        if (g.scorer) {
          const key = `${g.teamCode || ""}|${g.scorer}`;
          const cur = scorers.get(key) || { name: g.scorer, teamCode: g.teamCode || null, count: 0 };
          cur.count++;
          scorers.set(key, cur);
        }
        if (g.assist) {
          const key = `${g.teamCode || ""}|${g.assist}`;
          const cur = assists.get(key) || { name: g.assist, teamCode: g.teamCode || null, count: 0 };
          cur.count++;
          assists.set(key, cur);
        }
      }
    }

    const byRank = (a: ScorerEntry, b: ScorerEntry) =>
      b.count - a.count || a.name.localeCompare(b.name, "he");

    return NextResponse.json({
      topScorers: Array.from(scorers.values()).sort(byRank),
      topAssists: Array.from(assists.values()).sort(byRank),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
