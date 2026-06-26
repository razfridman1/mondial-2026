import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/live-scores — public live ticker for in-progress and finished matches.
 * Returns merged live_data/live_scores + live_data/match_goals so finished
 * match cards can show goal scorers even after live tracking ends.
 *
 * Goals from match_goals (ExternalGoal: { teamCode, scorer, assist, minute, type })
 * are converted to LiveGoal format ({ team:"home"|"away", player, assist, minute, type })
 * and merged into any live_scores entry that has an empty goals array. */
export async function GET() {
  try {
    const { db } = getAdmin();
    const [liveSnap, goalsSnap] = await Promise.all([
      db.collection("live_data").doc("live_scores").get(),
      db.collection("live_data").doc("match_goals").get(),
    ]);

    const liveData: Record<string, any> = liveSnap.exists ? (liveSnap.data() || {}) : {};
    const goalsData: Record<string, any> = goalsSnap.exists ? (goalsSnap.data() || {}) : {};

    // Merge match_goals into live_scores for matches missing goals
    const result: Record<string, any> = { ...liveData };

    for (const [matchId, mg] of Object.entries(goalsData)) {
      const mgGoals: any[] = mg?.goals || [];
      if (!mgGoals.length) continue;

      const live = result[matchId];
      const liveGoals: any[] = live?.goals || [];

      // Determine home/away codes
      const homeCode: string = live?.homeCode || mg?.homeCode || "";
      const awayCode: string = live?.awayCode || mg?.awayCode || "";

      // Convert ExternalGoal -> LiveGoal if live_scores entry is missing goals
      if (liveGoals.length === 0 && mgGoals.length > 0) {
        const converted = mgGoals.map((g: any) => ({
          minute: g.minute ?? null,
          team: g.teamCode === homeCode ? "home" : "away",
          player: g.scorer || g.player || "",
          ...(g.assist ? { assist: g.assist } : {}),
          ...(g.type ? { type: g.type } : {}),
        })).filter((g: any) => g.player);

        if (converted.length > 0) {
          result[matchId] = {
            ...(live || {}),
            homeCode,
            awayCode,
            goals: converted,
          };
        }
      }
    }

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
