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
 * Public — shows everyone's top-scorer/top-assist/champion picks.
 * Correctness markers (✅/❌) appear once the tournament is finished.
 * ===================================================================*/

function normalizeHe(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFKC")
    .replace(/['"\u05F3\u05F4]/g, "")
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

async function getChampionTeamCode(db: FirebaseFirestore.Firestore): Promise<string | null> {
  /* The champion is the winner of the FINAL match */
  const finalMatch = MATCHES.find(m => m.stage === "FINAL");
  if (!finalMatch) return null;
  const resSnap = await db.collection("match_results").doc(finalMatch.id).get();
  if (!resSnap.exists) return null;
  const data = resSnap.data() as any;
  if (!data?.winner) return null;
  return data.winner as string;
}

export async function GET(req: Request) {
  try {
    const { db, auth } = getAdmin();
    const groupId = new URL(req.url).searchParams.get("groupId");

    /* 1. Is the tournament over? */
    const resultsSnap = await db.collection("match_results").get();
    const finished = resultsSnap.size >= MATCHES.length && MATCHES.length > 0;

    /* 2. Current leaderboard + champion winner (if known). */
    const [{ topScorers, topAssists }, championCode] = await Promise.all([
      getScorerLeaderboards(db),
      getChampionTeamCode(db),
    ]);
    const topScorerLeaders = topLeaders(topScorers);
    const topAssistLeaders = topLeaders(topAssists);

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
        finished && championCode && championPick
          ? championPick.teamCode === championCode
          : null;

      return {
        uid: d.id,
        displayName,
        avatarId: data.avatarId || "messi",
        topScorerPick,
        topAssistPick,
        championPick,
        scorerCorrect: finished ? isPickCorrect(topScorerPick, topScorerLeaders) : null,
        assistCorrect: finished ? isPickCorrect(topAssistPick, topAssistLeaders) : null,
        championCorrect,
      };
    });

    /* Sort: most correct picks first, then by name */
    rows.sort((a, b) => {
      const score = (r: typeof a) =>
        (r.scorerCorrect ? 1 : 0) + (r.assistCorrect ? 1 : 0) + (r.championCorrect ? 1 : 0);
      return score(b) - score(a) || a.displayName.localeCompare(b.displayName, "he");
    });

    return NextResponse.json({ finished, topScorerLeaders, topAssistLeaders, rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
