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
  /* 1. Champion: winner of the FINAL match */
  const finalMatch = MATCHES.find(m => m.stage === "FINAL");
  let actualChampion: string | null = null;
  if (finalMatch) {
    const r = results[finalMatch.id];
    if (r?.winner) {
      actualChampion = r.winner;
    } else if (r && r.home != null && r.away != null) {
      actualChampion = r.home > r.away ? finalMatch.home : r.away > r.home ? finalMatch.away : null;
    }
  }

  /* 2. Top scorer / assist: read match_goals + name cache */
  let topScorerNorm: string[] = [];
  let topAssistNorm: string[] = [];
  let topScorerNames: string[] = [];
  let topAssistNames: string[] = [];
  try {
    const [goalsSnap, nameSnap] = await Promise.all([
      db.collection("live_data").doc("match_goals").get(),
      db.collection("live_data").doc("player_name_he").get(),
    ]);
    const goalsData = goalsSnap.exists ? (goalsSnap.data() || {}) : {};
    const nameMap: Record<string, string> = nameSnap.exists ? (nameSnap.data()?.map || {}) : {};

    const scorerCounts = new Map<string, number>();
    const assistCounts = new Map<string, number>();

    for (const mg of Object.values(goalsData) as any[]) {
      for (const g of (mg.goals || []) as any[]) {
        if (g.type === "OWN") continue;
        if (g.scorer) scorerCounts.set(g.scorer, (scorerCounts.get(g.scorer) || 0) + 1);
        if (g.assist) assistCounts.set(g.assist, (assistCounts.get(g.assist) || 0) + 1);
      }
    }

    function translate(name: string): string {
      return nameMap[name] || CURATED_HE_BY_EN[normalizeName(name)] || name;
    }

    const maxS = scorerCounts.size ? Math.max(...scorerCounts.values()) : 0;
    const maxA = assistCounts.size ? Math.max(...assistCounts.values()) : 0;

    if (maxS > 0) {
      topScorerNames = [...new Set(
        [...scorerCounts.entries()].filter(([, c]) => c === maxS).map(([n]) => translate(n))
      )];
      topScorerNorm = topScorerNames.map(normalizePickName);
    }
    if (maxA > 0) {
      topAssistNames = [...new Set(
        [...assistCounts.entries()].filter(([, c]) => c === maxA).map(([n]) => translate(n))
      )];
      topAssistNorm = topAssistNames.map(normalizePickName);
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
