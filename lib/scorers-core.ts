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

async function fetchFDScorers(limit = 20): Promise<{ scorers: ScorerEntry[]; assists: ScorerEntry[] } | null> {
  const apiKey = process.env.FOOTBALL_API_KEY;
  const baseUrl = process.env.FOOTBALL_API_URL || "https://api.football-data.org/v4";
  if (!apiKey) return null;
  try {
    const r = await fetch(
      `${baseUrl}/competitions/WC/scorers?limit=${limit}&season=2026`,
      { headers: { "X-Auth-Token": apiKey } },
    );
    if (!r.ok) return null;
    const data = await r.json();
    const raw: any[] = data.scorers || [];
    const scorers: ScorerEntry[] = [];
    const assists: ScorerEntry[] = [];
    for (const entry of raw) {
      const playerName: string = entry.player?.name || "";
      if (!playerName) continue;
      const tla: string = entry.team?.tla || "";
      const teamCode: string | null =
        teamCodeFromApiName(entry.team?.name) || (tla in TEAMS ? tla : null);
      const goals = typeof entry.goals === "number" ? entry.goals : 0;
      const assistCount = typeof entry.assists === "number" ? entry.assists : 0;
      if (goals > 0) scorers.push({ name: playerName, teamCode, count: goals });
      if (assistCount > 0) assists.push({ name: playerName, teamCode, count: assistCount });
    }
    const byRank = (a: ScorerEntry, b: ScorerEntry) =>
      b.count - a.count || a.name.localeCompare(b.name);
    scorers.sort(byRank);
    assists.sort(byRank);
    return { scorers, assists };
  } catch {
    return null;
  }
}

export async function getScorerLeaderboards(db: FirebaseFirestore.Firestore): Promise<ScorerLeaderboards> {
  const fd = await fetchFDScorers(20);

  const [goalsSnap, liveSnap] = await Promise.all([
    db.collection("live_data").doc("match_goals").get(),
    db.collection("live_data").doc("live_scores").get(),
  ]);
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

  if (fd && fd.scorers.length > 0) {
    rawScorers = fd.scorers;
    debugSource = "football-data.org";
    if (fd.assists.length >= 3) {
      rawAssists = fd.assists;
    } else {
      rawAssists = Array.from(fbAssists.values()).sort(byRank);
      debugSource += "+firestore-assists";
    }
  } else {
    rawScorers = Array.from(fbScorers.values()).sort(byRank);
    rawAssists = Array.from(fbAssists.values()).sort(byRank);
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
