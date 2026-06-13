import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { getScorerLeaderboards, type ScorerEntry } from "@/lib/scorers-core";
import { MATCHES } from "@/lib/data";
import type { TopPick } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* =====================================================================
 * GET /api/top-picks/all
 *
 * Public (no auth) — everyone's one-time "מלך השערים והבישולים" picks are
 * shown to everyone, as requested: a table of {user -> top-scorer pick,
 * top-assist pick}, with a ✅/❌ once the tournament is over and the real
 * winners are known.
 *
 * "Finished" = every scheduled match has a recorded result (the FINAL has
 * been played). Until then, no correctness markers are shown — picks are
 * still "open" predictions.
 * ===================================================================*/

/* Loose Hebrew-name match: strip apostrophes/gershayim/geresh and
 * collapse whitespace so e.g. "יובו לוקיץ'" ~ "יובו לוקיץ׳" ~ "יובו לוקיץ". */
function normalizeHe(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFKC")
    .replace(/['"׳״]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function topLeaders(entries: ScorerEntry[]): ScorerEntry[] {
  if (!entries.length || entries[0].count <= 0) return [];
  const max = entries[0].count;
  return entries.filter(e => e.count === max);
}

function isPickCorrect(pick: TopPick | null | undefined, leaders: ScorerEntry[]): boolean | null {
  if (!pick || !leaders.length) return null;
  return leaders.some(l => l.teamCode === pick.teamCode && normalizeHe(l.name) === normalizeHe(pick.playerName));
}

export async function GET() {
  try {
    const { db, auth } = getAdmin();

    /* 1. Is the tournament over? */
    const resultsSnap = await db.collection("match_results").get();
    const finished = resultsSnap.size >= MATCHES.length && MATCHES.length > 0;

    /* 2. Current leaderboard (used both live and for final correctness). */
    const { topScorers, topAssists } = await getScorerLeaderboards(db);
    const topScorerLeaders = topLeaders(topScorers);
    const topAssistLeaders = topLeaders(topAssists);

    /* 3. Every profile with at least one pick set. */
    const profSnap = await db.collection("profiles").get();
    const withPicks = profSnap.docs.filter(d => {
      const data = d.data() as any;
      return !!(data.topScorerPick || data.topAssistPick);
    });

    /* 4. Display names — Firestore profile first, fall back to Firebase
     * Auth (Google sign-in) like the leaderboard does. */
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
      const authMeta = authMetaByUid[d.id] || {};
      const displayName =
        data.displayName ||
        authMeta.displayName ||
        (authMeta.email ? authMeta.email.split("@")[0] : null) ||
        "משתמש";
      return {
        uid: d.id,
        displayName,
        avatarId: data.avatarId || "messi",
        topScorerPick,
        topAssistPick,
        scorerCorrect: finished ? isPickCorrect(topScorerPick, topScorerLeaders) : null,
        assistCorrect: finished ? isPickCorrect(topAssistPick, topAssistLeaders) : null,
      };
    });

    /* Sort: users who got both right first, then one right, then by name. */
    rows.sort((a, b) => {
      const score = (r: typeof a) => (r.scorerCorrect ? 1 : 0) + (r.assistCorrect ? 1 : 0);
      return score(b) - score(a) || a.displayName.localeCompare(b.displayName, "he");
    });

    return NextResponse.json({
      finished,
      topScorerLeaders,
      topAssistLeaders,
      rows,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
