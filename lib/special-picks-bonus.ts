/* =====================================================================
 * computeSpecialPickBonuses — 12-pt bonuses for:
 *   1. Correct champion pick (team wins the FINAL)
 *   2. Correct top-scorer pick
 *   3. Correct top-assist pick
 *
 * Uses Firestore data only — no external API calls.
 * Names from match_goals (English) are translated via player_name_he cache.
 * ===================================================================*/
import { MATCHES } from "./data";
import { normalizeName, SQUADS } from "./players";

/* Loose normalizer for Hebrew/transliterated name comparison */
export function normalizePickName(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFKC")
    .replace(/['"\u05F3\u05F4]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* Curated EN→HE map from squads (same as scorers-core) */
const CURATED_HE_BY_EN: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const list of Object.values(SQUADS)) {
    for (const p of list) {
      if (p.nameEn && p.name) out[normalizeName(p.nameEn)] = p.name;
    }
  }
  return out;
})();

export interface SpecialPickProfile {
  uid: string;
  championPick?: { teamCode: string } | null;
  topScorerPick?: { playerName: string; teamCode?: string } | null;
  topAssistPick?: { playerName: string; teamCode?: string } | null;
}

export interface SpecialPickActuals {
  /* Team code of the FINAL winner, or null if not decided yet. */
  actualChampion: string | null;
  /* Normalized (lowercased, punctuation-stripped) names, for comparison. */
  topScorerNorm: string[];
  topAssistNorm: string[];
  /* Human-readable (translated) names, for display in admin UI. Deduped,
   * can contain more than one name if there's a tie for the max. */
  topScorerNames: string[];
  topAssistNames: string[];
}

/* Computes the "ground truth" for the three special picks — the actual
 * tournament champion (from the FINAL match result) and the actual top
 * scorer(s) / top assist(s) (from live match_goals data). Shared by
 * computeSpecialPickBonuses (leaderboard/snapshot scoring) and the
 * "ניקוד סופי" admin action (lib/special-picks-bonus consumers). */
export async function computeSpecialPickActuals(
  db: FirebaseFirestore.Firestore,
  results: Record<string, { home?: number; away?: number; winner?: string }>,
): Promise<SpecialPickActuals> {
  /* Manual admin override (live_data/final_score_override) — fetched once,
   * up front, and takes priority over every scraped/computed source for all
   * three categories. Lets the admin pin down champion/scorer/assist by
   * hand (e.g. before match_results has a FINAL row, or when the FIFA
   * scrape disagrees), via set-final-score-override.mjs. */
  let overrideData: any = {};
  try {
    const overrideSnap = await db.collection("live_data").doc("final_score_override").get();
    overrideData = overrideSnap.exists ? (overrideSnap.data() || {}) : {};
  } catch { /* non-fatal */ }

  /* 1. Champion: winner of the FINAL match (or the override). */
  const finalMatch = MATCHES.find(m => m.stage === "FINAL");
  let actualChampion: string | null = overrideData.champion?.teamCode || null;
  if (!actualChampion && finalMatch) {
    const r = results[finalMatch.id];
    if (r?.winner) {
      actualChampion = r.winner;
    } else if (r && r.home != null && r.away != null) {
      actualChampion = r.home > r.away ? finalMatch.home : r.away > r.home ? finalMatch.away : null;
    }
  }

  /* 2. Top scorer / assist: SAME source + priority as the public "מלך השערים"
   * tab (/api/scorers, lib/scorers-core.ts) — the FIFA-scraped leaderboards
   * (live_data/fifa_scorers + fifa_assists, populated by `node crawl-fifa.mjs`)
   * are the primary source, i.e. "whoever is currently in first place".
   * Only falls back to aggregating match_goals when the FIFA docs aren't
   * present, so the button's ground truth never disagrees with what users
   * see on the leaderboard. */
  let topScorerNorm: string[] = [];
  let topAssistNorm: string[] = [];
  let topScorerNames: string[] = [];
  let topAssistNames: string[] = [];
  try {
    const [goalsSnap, nameSnap, fifaScorersSnap, fifaAssistsSnap] = await Promise.all([
      db.collection("live_data").doc("match_goals").get(),
      db.collection("live_data").doc("player_name_he").get(),
      db.collection("live_data").doc("fifa_scorers").get(),
      db.collection("live_data").doc("fifa_assists").get(),
    ]);
    const goalsData = goalsSnap.exists ? (goalsSnap.data() || {}) : {};
    const nameMap: Record<string, string> = nameSnap.exists ? (nameSnap.data()?.map || {}) : {};

    function translate(name: string): string {
      return nameMap[name] || CURATED_HE_BY_EN[normalizeName(name)] || name;
    }

    /* 0. Manual admin override for scorer/assist (same overrideData fetched
     * above for champion) — highest priority. Set independently per
     * category via set-final-score-override.mjs; each holds every known
     * name variant (Hebrew + English) so it matches regardless of which
     * form a given user's pick was stored in. */
    const scorerOverride: string[] = Array.isArray(overrideData.scorer?.names) ? overrideData.scorer.names : [];
    const assistOverride: string[] = Array.isArray(overrideData.assist?.names) ? overrideData.assist.names : [];
    if (scorerOverride.length) {
      topScorerNames = [...new Set(scorerOverride)];
      topScorerNorm = topScorerNames.map(normalizePickName);
    }
    if (assistOverride.length) {
      topAssistNames = [...new Set(assistOverride)];
      topAssistNorm = topAssistNames.map(normalizePickName);
    }

    const fifaScorers: { name: string; count: number }[] = fifaScorersSnap.exists
      ? (fifaScorersSnap.data()?.scorers || []) : [];
    const fifaAssists: { name: string; count: number }[] = fifaAssistsSnap.exists
      ? (fifaAssistsSnap.data()?.assists || []) : [];

    const needScorer = !scorerOverride.length;
    const needAssist = !assistOverride.length;

    if (needScorer || needAssist) {
      if (fifaScorers.length && fifaAssists.length) {
        /* Primary: FIFA-scraped leaderboard (same as /api/scorers) */
        const maxS = Math.max(...fifaScorers.map(s => s.count || 0));
        const maxA = Math.max(...fifaAssists.map(a => a.count || 0));
        if (needScorer && maxS > 0) {
          topScorerNames = [...new Set(
            fifaScorers.filter(s => s.count === maxS).map(s => translate(s.name))
          )];
          topScorerNorm = topScorerNames.map(normalizePickName);
        }
        if (needAssist && maxA > 0) {
          topAssistNames = [...new Set(
            fifaAssists.filter(a => a.count === maxA).map(a => translate(a.name))
          )];
          topAssistNorm = topAssistNames.map(normalizePickName);
        }
      } else {
        /* Fallback: aggregate from raw match_goals events */
        const scorerCounts = new Map<string, number>();
        const assistCounts = new Map<string, number>();

        for (const mg of Object.values(goalsData) as any[]) {
          for (const g of (mg.goals || []) as any[]) {
            if (g.type === "OWN") continue;
            if (g.scorer) scorerCounts.set(g.scorer, (scorerCounts.get(g.scorer) || 0) + 1);
            if (g.assist) assistCounts.set(g.assist, (assistCounts.get(g.assist) || 0) + 1);
          }
        }

        const maxS = scorerCounts.size ? Math.max(...scorerCounts.values()) : 0;
        const maxA = assistCounts.size ? Math.max(...assistCounts.values()) : 0;

        if (needScorer && maxS > 0) {
          topScorerNames = [...new Set(
            [...scorerCounts.entries()].filter(([, c]) => c === maxS).map(([n]) => translate(n))
          )];
          topScorerNorm = topScorerNames.map(normalizePickName);
        }
        if (needAssist && maxA > 0) {
          topAssistNames = [...new Set(
            [...assistCounts.entries()].filter(([, c]) => c === maxA).map(([n]) => translate(n))
          )];
          topAssistNorm = topAssistNames.map(normalizePickName);
        }
      }
    }
  } catch { /* non-fatal */ }

  return { actualChampion, topScorerNorm, topAssistNorm, topScorerNames, topAssistNames };
}

export async function computeSpecialPickBonuses(
  db: FirebaseFirestore.Firestore,
  profiles: SpecialPickProfile[],
  results: Record<string, { home?: number; away?: number; winner?: string }>,
): Promise<Map<string, number>> {
  const bonuses = new Map<string, number>();
  const actuals = await computeSpecialPickActuals(db, results);

  for (const prof of profiles) {
    let bonus = 0;
    if (actuals.actualChampion && prof.championPick?.teamCode === actuals.actualChampion) bonus += 12;
    if (prof.topScorerPick && actuals.topScorerNorm.length) {
      if (actuals.topScorerNorm.includes(normalizePickName(prof.topScorerPick.playerName))) bonus += 12;
    }
    if (prof.topAssistPick && actuals.topAssistNorm.length) {
      if (actuals.topAssistNorm.includes(normalizePickName(prof.topAssistPick.playerName))) bonus += 12;
    }
    if (bonus > 0) bonuses.set(prof.uid, bonus);
  }
  return bonuses;
}
