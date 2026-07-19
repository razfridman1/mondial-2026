import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { computeSpecialPickActuals, normalizePickName } from "@/lib/special-picks-bonus";
import { MATCHES } from "@/lib/data";
import type { TopPick } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* =====================================================================
 * GET /api/top-picks/all
 * Public — shows everyone's top-scorer/top-assist/champion picks.
 * Correctness (✅/❌) is computed via the EXACT SAME ground truth as the
 * admin "ניקוד סופי" bonus (lib/special-picks-bonus.ts) — same FIFA-scraped
 * leaderboard priority, same match_goals fallback, same manual override.
 * Each category shows ✅/❌ as soon as IT is individually decided, not
 * gated on the whole tournament being finished — matching how bonuses are
 * actually awarded (mid-tournament, per category).
 * ===================================================================*/

function isPickCorrect(pick: TopPick | null | undefined, normNames: string[]): boolean | null {
  if (!pick || !normNames.length) return null;
  return normNames.includes(normalizePickName(pick.playerName));
}

export async function GET(req: Request) {
  try {
    const { db, auth } = getAdmin();
    const groupId = new URL(req.url).searchParams.get("groupId");

    /* 1. Ground truth — same call the admin "ניקוד סופי" button makes, so
     * the ✅/❌ shown here always matches what actually gets scored. */
    const resultsSnap = await db.collection("match_results").get();
    const finished = resultsSnap.size >= MATCHES.length && MATCHES.length > 0;
    const results: Record<string, { home?: number; away?: number; winner?: string }> = {};
    resultsSnap.forEach(d => {
      const data = d.data() as any;
      results[d.id] = { home: data.home, away: data.away, winner: data.winner };
    });
    const actuals = await computeSpecialPickActuals(db, results);
    const championCode = actuals.actualChampion;

    /* 3. Optional group scope */
    let groupUids: Set<string> | null = null;
    if (groupId) {
      const memSnap = await db.collection("group_memberships").where("groupId", "==", groupId).get();
      groupUids = new Set(
        memSnap.docs.filter(d => !(d.data() as any).left).map(d => d.data().uid as string)
      );
    }

    /* 4. Profiles with at least one pick */
    const profSnap = await db.collection("profiles").get();
    const withPicks = profSnap.docs.filter(d => {
      const data = d.data() as any;
      if (!(data.topScorerPick || data.topAssistPick || data.championPick)) return false;
      if (groupUids && !groupUids.has(d.id)) return false;
      return true;
    });

    /* 5. Display names */
    const uids = withPicks.map(d => d.id);
    const authMetaByUid: Record<string, { displayName?: string; email?: string }> = {};
    for (let i = 0; i < uids.length; i += 100) {
      const chunk = uids.slice(i, i + 100).map(uid => ({ uid }));
      try {
        const res = await auth.getUsers(chunk);
        for (const u of res.users) {
          authMetaByUid[u.uid] = { displayName: u.displayName || undefined, email: u.email || undefined };
        }
      } catch { /* best-effort */ }
    }

    const rows = withPicks.map(d => {
      const data = d.data() as any;
      const topScorerPick: TopPick | null = data.topScorerPick || null;
      const topAssistPick: TopPick | null = data.topAssistPick || null;
      const championPick: { teamCode: string } | null = data.championPick || null;
      const authMeta = authMetaByUid[d.id] || {};
      const displayName =
        data.displayName ||
        authMeta.displayName ||
        (authMeta.email ? authMeta.email.split("@")[0] : null) ||
        "משתמש";

      const championCorrect =
        championCode && championPick
          ? championPick.teamCode === championCode
          : null;

      return {
        uid: d.id,
        displayName,
        avatarId: data.avatarId || "messi",
        topScorerPick,
        topAssistPick,
        championPick,
        scorerCorrect: isPickCorrect(topScorerPick, actuals.topScorerNorm),
        assistCorrect: isPickCorrect(topAssistPick, actuals.topAssistNorm),
        championCorrect,
      };
    });

    /* Sort: most correct picks first, then by name */
    rows.sort((a, b) => {
      const score = (r: typeof a) =>
        (r.scorerCorrect ? 1 : 0) + (r.assistCorrect ? 1 : 0) + (r.championCorrect ? 1 : 0);
      return score(b) - score(a) || a.displayName.localeCompare(b.displayName, "he");
    });

    return NextResponse.json({
      finished,
      topScorerLeaders: actuals.topScorerNames.map(name => ({ name, count: 0 })),
      topAssistLeaders: actuals.topAssistNames.map(name => ({ name, count: 0 })),
      rows,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
