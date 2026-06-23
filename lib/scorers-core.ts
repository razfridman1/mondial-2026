import type { ExternalGoal } from "./football-data-api";
import { SQUADS, normalizeName } from "./players";
import { translateNamesToHebrew } from "./ai-result-fallback";

/* =====================================================================
 * Shared "מלך השערים והבישולים" leaderboard aggregation — used by
 * /api/scorers (the public leaderboard) and /api/top-picks (to check
 * each user's one-time pick against the current leader).
 *
 * Aggregates the structured goal/assist data persisted by
 * /api/cron/sync-results (Firestore live_data/match_goals — written per
 * finished match as { goals: ExternalGoal[], homeCode, awayCode }).
 *
 * Ranking: descending by count; ties broken alphabetically by player name.
 * Own goals (type === "OWN") are excluded from both leaderboards.
 *
 * Player names ("name" field below) are returned in HEBREW where possible:
 *  1. Players with curated Hebrew bios (lib/players.ts SQUADS) use that name.
 *  2. Otherwise, a Hebrew transliteration is looked up from the
 *     live_data/player_name_he cache (built up over time by
 *     translateNamesToHebrew — see lib/ai-result-fallback.ts).
 *  3. Any name still untranslated falls back to the original (English)
 *     name from the source data — never fabricated, just not yet cached.
 * ===================================================================*/
export interface ScorerEntry {
  name: string;
  teamCode: string | null;
  count: number;
}

export interface ScorerLeaderboards {
  topScorers: ScorerEntry[];
  topAssists: ScorerEntry[];
  debug: {
    matchGoals: Record<string, {
      homeCode?: string;
      awayCode?: string;
      goalCount: number;
      goals: { side?: string; scorer?: string; assist?: string; type?: string; minute?: number }[];
    }>;
    nameResolution: { originalName: string; displayedName: string; resolvedFrom: "curated" | "cache" | "ai-just-now" | "english-fallback" }[];
    translateReason?: string;
  };
}

/* English (normalized) -> Hebrew name, built once from the curated
 * star-player database (covers the most commonly-scoring teams). */
const CURATED_HE_BY_EN: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const list of Object.values(SQUADS)) {
    for (const p of list) {
      if (p.nameEn && p.name) out[normalizeName(p.nameEn)] = p.name;
    }
  }
  return out;
})();

export async function getScorerLeaderboards(db: FirebaseFirestore.Firestore): Promise<ScorerLeaderboards> {
  /* Primary source: live_data/match_goals — written by the goals-lookup
   * cron step (lookupGoalsViaAI or football-data.org details).
   * Fallback source: live_data/live_scores — written by the live-ticker
   * step during the match; uses {player} instead of {scorer}.
   * If match_goals has goals for a match we use those; otherwise we fall
   * back to live_scores so that matches whose dedicated goal lookup failed
   * (found: false) are still counted. */
  const [snap, liveSnap] = await Promise.all([
    db.collection("live_data").doc("match_goals").get(),
    db.collection("live_data").doc("live_scores").get(),
  ]);
  const data: Record<string, { goals?: ExternalGoal[]; homeCode?: string; awayCode?: string }> =
    snap.exists ? (snap.data() || {}) : {};
  const liveData: Record<string, any> =
    liveSnap.exists ? (liveSnap.data() || {}) : {};

  /* Union of all match IDs across both sources */
  const allMatchIds = new Set([...Object.keys(data), ...Object.keys(liveData)]);

  const scorers = new Map<string, ScorerEntry>();
  const assists = new Map<string, ScorerEntry>();

  for (const matchId of allMatchIds) {
    const matchGoalsEntry = data[matchId];
    const liveEntry = liveData[matchId];

    let goals: ExternalGoal[];

    if (matchGoalsEntry && (matchGoalsEntry.goals || []).length > 0) {
      /* Primary: explicit goal-lookup result — trust this over live ticker */
      goals = matchGoalsEntry.goals!;
    } else if (liveEntry && (liveEntry.goals || []).length > 0) {
      /* Fallback: live ticker goals — field is "player", team is "home"|"away" */
      goals = (liveEntry.goals as any[])
        .map(g => ({
          minute: g.minute ?? null,
          teamCode: g.team === "home"
            ? (liveEntry.homeCode || null)
            : (liveEntry.awayCode || null),
          scorer: (g.player || "").trim(),
          ...(g.assist ? { assist: g.assist } : {}),
          ...(g.type ? { type: g.type } : {}),
        } as ExternalGoal))
        .filter(g => g.scorer);
    } else {
      continue;
    }

    for (const g of goals) {
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

  /* ----- Hebrew names: curated DB first, then a Firestore-cached AI
   * transliteration for everyone else. ------------------------------- */
  const allEntries = [...scorers.values(), ...assists.values()];
  const heByEn = new Map<string, string>();
  const stillNeeded: string[] = [];

  for (const entry of allEntries) {
    const curated = CURATED_HE_BY_EN[normalizeName(entry.name)];
    if (curated) heByEn.set(entry.name, curated);
  }

  const namesNeedingCache = allEntries
    .map(e => e.name)
    .filter(n => !heByEn.has(n));

  let cache: Record<string, string> = {};
  if (namesNeedingCache.length) {
    try {
      const cacheSnap = await db.collection("live_data").doc("player_name_he").get();
      cache = cacheSnap.exists ? (cacheSnap.data()?.map || {}) : {};
    } catch {
      cache = {};
    }
    for (const n of namesNeedingCache) {
      if (cache[n]) heByEn.set(n, cache[n]);
      else stillNeeded.push(n);
    }
  }

  let translateReason: string | undefined;
  if (stillNeeded.length) {
    try {
      const { map: translated, reason } = await translateNamesToHebrew(stillNeeded);
      translateReason = reason;
      if (Object.keys(translated).length) {
        for (const [en, he] of Object.entries(translated)) heByEn.set(en, he);
        await db.collection("live_data").doc("player_name_he").set(
          { map: { ...cache, ...translated } },
          { merge: true }
        );
      }
    } catch (e: any) {
      // best-effort only — entries simply keep their English name for now
      translateReason = `exception: ${e?.message || String(e)}`;
    }
  }

  /* Snapshot original (English) names for the debug name-resolution
   * report BEFORE mutating entry.name to Hebrew below. */
  const originalNames = allEntries.map(e => e.name);

  for (const entry of allEntries) {
    const he = heByEn.get(entry.name);
    if (he) entry.name = he;
  }

  const byRank = (a: ScorerEntry, b: ScorerEntry) =>
    b.count - a.count || a.name.localeCompare(b.name, "he");

  const topScorers = Array.from(scorers.values()).sort(byRank);
  const topAssists = Array.from(assists.values()).sort(byRank);

  const debug = {
    matchGoals: Object.fromEntries(
      [...allMatchIds].map(matchId => {
        const mg = data[matchId];
        const lv = liveData[matchId];
        const usedLive = !mg || (mg.goals || []).length === 0;
        const goals = usedLive ? (lv?.goals || []) : (mg?.goals || []);
        return [matchId, {
          homeCode: mg?.homeCode ?? lv?.homeCode,
          awayCode: mg?.awayCode ?? lv?.awayCode,
          goalCount: goals.length,
          source: usedLive ? "live_scores_fallback" : "match_goals",
          goals: goals.map((g: any) => ({
            side: g.teamCode ?? g.team ?? undefined,
            scorer: g.scorer ?? g.player,
            assist: g.assist,
            type: g.type,
            minute: g.minute ?? undefined,
          })),
        }];
      })
    ),
    nameResolution: allEntries.map((e, i) => {
      const original = originalNames[i];
      return {
        originalName: original,
        displayedName: e.name,
        resolvedFrom: (CURATED_HE_BY_EN[normalizeName(original)]
          ? "curated"
          : cache[original]
            ? "cache"
            : heByEn.has(original) ? "ai-just-now" : "english-fallback") as "curated" | "cache" | "ai-just-now" | "english-fallback",
      };
    }),
    translateReason,
  };

  return { topScorers, topAssists, debug };
}
