import type { ExternalGoal } from "./football-data-api";
import { SQUADS, normalizeName } from "./players";
import { translateNamesToHebrew } from "./ai-result-fallback";
import { teamCodeFromApiName } from "./team-name-mapper";
import { TEAMS } from "./data";

/* =====================================================================
 * Shared leaderboard aggregation for top scorers / top assists.
 *
 * PRIMARY source: football-data.org /v4/competitions/WC/scorers
 * FALLBACK: live_data/match_goals + live_data/live_scores (Firestore)
 * Shows top 8 only.
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
    source: string;
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

const CURATED_HE_BY_EN: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const list of Object.values(SQUADS)) {
    for (const p of list) {
      if (p.nameEn && p.name) out[normalizeName(p.nameEn)] = p.name;
    }
  }
  return out;
})();

/** Fetch top scorers and assists from football-data.org
 *  Endpoint: GET /v4/competitions/WC/scorers?season=2026&limit=20
 *  Uses the same FOOTBALL_API_KEY + X-Auth-Token already configured for
 *  match results and goal details — no extra credentials needed.
 */
async function fetchFDScorers(_limit = 20): Promise<{ scorers: ScorerEntry[]; assists: ScorerEntry[] } | null> {
  const apiKey = process.env.FOOTBALL_API_KEY;
  const baseUrl = (process.env.FOOTBALL_API_URL || "https://api.football-data.org/v4").replace(/\/$/, "");
  if (!apiKey) return null;

  const headers: Record<string, string> = { "X-Auth-Token": apiKey, "Accept": "application/json" };

  const byRank = (a: ScorerEntry, b: ScorerEntry) =>
    b.count - a.count || a.name.localeCompare(b.name);

  try {
    const r = await fetch(`${baseUrl}/competitions/WC/scorers?season=2026&limit=20`, {
      headers,
      cache: "no-store",
    });
    if (!r.ok) return null;
    const data = await r.json();

    const scorers: ScorerEntry[] = [];
    const assists: ScorerEntry[] = [];

    for (const entry of (data?.scorers ?? [])) {
      // football-data.org always has player.name; firstName/lastName as fallback
      const playerName: string = entry.player?.name ||
        (entry.player?.firstName
          ? `${entry.player.firstName} ${entry.player?.lastName || ""}`.trim()
          : "");
      if (!playerName) continue;
      // Use TLA directly (ARG, FRA, …) — matches our internal team codes exactly
      const tla: string | null = entry.team?.tla || null;
      const teamName: string = entry.team?.name || entry.team?.shortName || "";
      const teamCode = teamCodeFromApiName(teamName) || tla;
      const goals: number = entry.goals ?? 0;
      const assts: number = entry.assists ?? 0;
      if (goals > 0) scorers.push({ name: playerName, teamCode, count: goals });
      if (assts > 0) assists.push({ name: playerName, teamCode, count: assts });
    }

    scorers.sort(byRank);
    assists.sort(byRank);

    if (scorers.length === 0 && assists.length === 0) return null;
    return { scorers, assists };
  } catch {
    return null;
  }
}

/** Force-refresh the cached_scorers doc from football-data.org. Called by admin sync endpoint. */
export async function cacheScorerLeaderboards(db: FirebaseFirestore.Firestore): Promise<{ scorers: ScorerEntry[]; assists: ScorerEntry[] } | null> {
  const fd = await fetchFDScorers(20);
  if (!fd || (fd.scorers.length === 0 && fd.assists.length === 0)) return null;
  await db.collection("live_data").doc("cached_scorers").set({ scorers: fd.scorers, assists: fd.assists, updatedAt: Date.now() });
  return fd;
}

export async function getScorerLeaderboards(db: FirebaseFirestore.Firestore): Promise<ScorerLeaderboards> {
  const [fdResult, cacheSnap, goalsSnap, liveSnap] = await Promise.all([
    fetchFDScorers(20),
    db.collection("live_data").doc("cached_scorers").get(),
    db.collection("live_data").doc("match_goals").get(),
    db.collection("live_data").doc("live_scores").get(),
  ]);

  // Persist fresh API result to Firestore cache for future cold-starts / API outages
  let fd = fdResult;
  if (fd && (fd.scorers.length > 0 || fd.assists.length > 0)) {
    db.collection("live_data").doc("cached_scorers")
      .set({ scorers: fd.scorers, assists: fd.assists, updatedAt: Date.now() })
      .catch(() => {});
  } else {
    // API unavailable — use the Firestore cache (even if stale)
    const cached = cacheSnap.exists ? (cacheSnap.data() as any) : null;
    if (cached?.scorers?.length > 0 || cached?.assists?.length > 0) {
      fd = { scorers: cached.scorers || [], assists: cached.assists || [] };
    }
  }
  const goalsData: Record<string, { goals?: ExternalGoal[]; homeCode?: string; awayCode?: string }> =
    goalsSnap.exists ? (goalsSnap.data() || {}) : {};
  const liveData: Record<string, any> =
    liveSnap.exists ? (liveSnap.data() || {}) : {};

  const allMatchIds = new Set([...Object.keys(goalsData), ...Object.keys(liveData)]);
  const fbScorers = new Map<string, ScorerEntry>();
  const fbAssists = new Map<string, ScorerEntry>();

  for (const matchId of allMatchIds) {
    const mgEntry = goalsData[matchId];
    const lvEntry = liveData[matchId];
    let goals: ExternalGoal[];
    if (mgEntry && (mgEntry.goals || []).length > 0) {
      goals = mgEntry.goals!;
    } else if (lvEntry && (lvEntry.goals || []).length > 0) {
      goals = (lvEntry.goals as any[])
        .map((g: any) => ({
          minute: g.minute ?? null,
          teamCode: g.team === "home" ? (lvEntry.homeCode || null) : (lvEntry.awayCode || null),
          scorer: (g.player || "").trim(),
          ...(g.assist ? { assist: g.assist } : {}),
          ...(g.type ? { type: g.type } : {}),
        } as ExternalGoal))
        .filter((g: ExternalGoal) => g.scorer);
    } else {
      continue;
    }
    for (const g of goals) {
      if (!g || g.type === "OWN") continue;
      if (g.scorer) {
        const key = `${g.teamCode || ""}|${g.scorer}`;
        const cur = fbScorers.get(key) || { name: g.scorer, teamCode: g.teamCode || null, count: 0 };
        cur.count++;
        fbScorers.set(key, cur);
      }
      if (g.assist) {
        const key = `${g.teamCode || ""}|${g.assist}`;
        const cur = fbAssists.get(key) || { name: g.assist, teamCode: g.teamCode || null, count: 0 };
        cur.count++;
        fbAssists.set(key, cur);
      }
    }
  }

  const byRank = (a: ScorerEntry, b: ScorerEntry) =>
    b.count - a.count || a.name.localeCompare(b.name);

  let rawScorers: ScorerEntry[];
  let rawAssists: ScorerEntry[];
  let debugSource: string;

  // -- Assists priority: API-Football /players/topassists → Firestore fallback --
  // API-Football is always primary. We never let a stale cache override live data.
  if (fd && fd.scorers.length > 0) {
    rawScorers = fd.scorers;
    // For assists: football-data.org scorers list includes assists per player.
    // Supplement with match_goals for pure assisters (0 goals, >0 assists).
    if (fd.assists.length > 0) {
      // Merge: fd.assists is primary; add match_goals entries not already covered
      const fdNames = new Set(fd.assists.map(a => normalizeName(a.name)));
      const extra = Array.from(fbAssists.values()).filter(e => !fdNames.has(normalizeName(e.name)));
      rawAssists = [...fd.assists, ...extra].sort(byRank);
      debugSource = "football-data.org";
    } else {
      // fd.org returned no assist data for this comp — use match_goals only
      rawAssists = Array.from(fbAssists.values()).sort(byRank);
      debugSource = "football-data.org-scorers+match_goals-assists";
    }
  } else {
    rawScorers = Array.from(fbScorers.values()).sort(byRank);
    debugSource = "firestore-fallback";
  }

  const top8Scorers = rawScorers.slice(0, 8);
  const top8Assists = rawAssists.slice(0, 8);

  const allEntries = [...top8Scorers, ...top8Assists];
  const heByEn = new Map<string, string>();

  for (const entry of allEntries) {
    const curated = CURATED_HE_BY_EN[normalizeName(entry.name)];
    if (curated) heByEn.set(entry.name, curated);
  }

  const namesNeedingCache = allEntries.map(e => e.name).filter(n => !heByEn.has(n));
  let cache: Record<string, string> = {};
  const stillNeeded: string[] = [];

  if (namesNeedingCache.length) {
    try {
      const cacheSnap = await db.collection("live_data").doc("player_name_he").get();
      cache = cacheSnap.exists ? (cacheSnap.data()?.map || {}) : {};
    } catch { cache = {}; }
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
      translateReason = `exception: ${(e as any)?.message || String(e)}`;
    }
  }

  const originalNames = allEntries.map(e => e.name);
  for (const entry of allEntries) {
    const he = heByEn.get(entry.name);
    if (he) entry.name = he;
  }

  const debugMatchGoals = Object.fromEntries(
    [...allMatchIds].map(matchId => {
      const mg = goalsData[matchId];
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
  );

  return {
    topScorers: top8Scorers,
    topAssists: top8Assists,
    debug: {
      source: debugSource,
      matchGoals: debugMatchGoals,
      nameResolution: allEntries.map((e, i) => {
        const original = originalNames[i];
        return {
          originalName: original,
          displayedName: e.name,
          resolvedFrom: (CURATED_HE_BY_EN[normalizeName(original)]
            ? "curated"
            : cache[original]
              ? "cache"
              : heByEn.has(original) ? "ai-just-now" : "english-fallback") as any,
        };
      }),
      translateReason,
    },
  };
}
