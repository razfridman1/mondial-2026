/* =====================================================================
 * Standings Engine — FIFA-compliant group standings + knockout bracket.
 *
 * Deterministic, pure functions. Input: matches + results. Output: standings.
 *
 * Tiebreaker order (per FIFA 2026 World Cup rules):
 *   1. Points
 *   2. Goal Difference
 *   3. Goals For
 *   4. Head-to-Head points (between tied teams only)
 *   5. Head-to-Head goal difference
 *   6. Head-to-Head goals for
 *   7. Fair-play points (not tracked → skipped)
 *   8. Drawing of lots → deterministic alphabetical fallback by team code
 * ===================================================================*/

import { MATCHES, TEAMS } from "./data";
import type { Match, StageId } from "./types";

export interface MatchResult {
  home: number;
  away: number;
  finishedAt: number;
}

export type QualificationStatus = "qualified" | "third-place" | "eliminated" | "pending";
export type FormChar = "W" | "D" | "L";

export interface ChipMatch {
  matchId: string;
  opponentCode: string;
  opponentName: string;
  opponentFlag: string;
  scoreFor: number | null;
  scoreAgainst: number | null;
  result: FormChar | null;
  isHome: boolean;
  finished: boolean;
  utc: string;
}

export interface TeamStanding {
  teamCode: string;
  teamName: string;
  teamFlag: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  position: number;
  /* If the group has fully concluded, "previousPosition" is undefined;
   * for in-progress groups, this is the position as of one fewer match per team.
   * Use it to render up/down arrows. */
  previousPosition?: number;
  qualificationStatus: QualificationStatus;
  form: FormChar[];
  matches: ChipMatch[];
}

/* ----------------------------------------------------------------------
 * computeGroupStandings — main entry for group stage
 * ----------------------------------------------------------------------*/
export function computeGroupStandings(
  groupId: string,
  results: Record<string, MatchResult>
): TeamStanding[] {
  const groupMatches = MATCHES.filter(m => m.stage === "GROUP" && m.group === groupId);
  if (!groupMatches.length) return [];

  /* Discover teams in this group */
  const teamSet = new Set<string>();
  groupMatches.forEach(m => { teamSet.add(m.home); teamSet.add(m.away); });

  const standings = [...teamSet].map(code => buildStanding(code, groupMatches, results));

  sortFifa(standings, groupMatches, results);
  assignPositions(standings);
  assignQualificationStatus(standings, groupMatches, results);

  /* For in-progress groups, compute previous position by simulating one
   * match earlier — useful for up/down arrows. We compute by going back
   * one finished match overall. Simpler heuristic: compare against a sort
   * that ignores the latest finished match. */
  const finishedMatches = groupMatches
    .filter(m => results[m.id])
    .sort((a, b) => (results[a.id].finishedAt) - (results[b.id].finishedAt));
  if (finishedMatches.length >= 1) {
    const previousResults = { ...results };
    delete previousResults[finishedMatches[finishedMatches.length - 1].id];
    const previousStandings = [...teamSet].map(code =>
      buildStanding(code, groupMatches, previousResults)
    );
    sortFifa(previousStandings, groupMatches, previousResults);
    assignPositions(previousStandings);
    const prevByCode: Record<string, number> = {};
    previousStandings.forEach(s => { prevByCode[s.teamCode] = s.position; });
    standings.forEach(s => { s.previousPosition = prevByCode[s.teamCode]; });
  }

  return standings;
}

function buildStanding(code: string, matches: Match[], results: Record<string, MatchResult>): TeamStanding {
  const team = TEAMS[code];
  const s: TeamStanding = {
    teamCode: code,
    teamName: team?.name || code,
    teamFlag: team?.flag || "🏳️",
    played: 0, won: 0, drawn: 0, lost: 0,
    goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
    position: 0,
    qualificationStatus: "pending",
    form: [],
    matches: [],
  };

  /* Iterate matches in chronological order so `form` array is ordered */
  const teamMatches = matches
    .filter(m => m.home === code || m.away === code)
    .sort((a, b) => +new Date(a.utc) - +new Date(b.utc));

  for (const m of teamMatches) {
    const isHome = m.home === code;
    const opponentCode = isHome ? m.away : m.home;
    const opp = TEAMS[opponentCode] || { name: opponentCode, flag: "🏳️" };
    const r = results[m.id];

    const chip: ChipMatch = {
      matchId: m.id,
      opponentCode,
      opponentName: opp.name,
      opponentFlag: opp.flag,
      scoreFor: null,
      scoreAgainst: null,
      result: null,
      isHome,
      finished: !!r,
      utc: m.utc,
    };

    if (r) {
      const my = isHome ? r.home : r.away;
      const opp = isHome ? r.away : r.home;
      chip.scoreFor = my;
      chip.scoreAgainst = opp;
      s.played++;
      s.goalsFor += my;
      s.goalsAgainst += opp;
      if (my > opp) { s.won++; s.points += 3; chip.result = "W"; s.form.push("W"); }
      else if (my === opp) { s.drawn++; s.points += 1; chip.result = "D"; s.form.push("D"); }
      else { s.lost++; chip.result = "L"; s.form.push("L"); }
    }

    s.matches.push(chip);
  }

  s.goalDifference = s.goalsFor - s.goalsAgainst;
  return s;
}

/* ----------------------------------------------------------------------
 * FIFA sort — applies all tiebreakers in sequence
 * ----------------------------------------------------------------------*/
function sortFifa(
  standings: TeamStanding[],
  groupMatches: Match[],
  results: Record<string, MatchResult>
): void {
  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;

    /* Head-to-head between just these two */
    const h2h = h2hCompare(a.teamCode, b.teamCode, groupMatches, results);
    if (h2h !== 0) return h2h;

    /* Deterministic fallback — alphabetical by team code (stand-in for "lots") */
    return a.teamCode.localeCompare(b.teamCode);
  });
}

function h2hCompare(
  ta: string, tb: string,
  matches: Match[], results: Record<string, MatchResult>
): number {
  const h2hMatches = matches.filter(m =>
    (m.home === ta && m.away === tb) ||
    (m.home === tb && m.away === ta)
  );
  let aPts = 0, bPts = 0, aGF = 0, bGF = 0;
  for (const m of h2hMatches) {
    const r = results[m.id];
    if (!r) continue;
    const aIsHome = m.home === ta;
    const aG = aIsHome ? r.home : r.away;
    const bG = aIsHome ? r.away : r.home;
    aGF += aG; bGF += bG;
    if (aG > bG) aPts += 3;
    else if (aG === bG) { aPts++; bPts++; }
    else bPts += 3;
  }
  if (aPts !== bPts) return bPts - aPts;
  const aGD = aGF - bGF, bGD = bGF - aGF;
  if (aGD !== bGD) return bGD - aGD;
  if (aGF !== bGF) return bGF - aGF;
  return 0;
}

function assignPositions(standings: TeamStanding[]): void {
  standings.forEach((s, i) => { s.position = i + 1; });
}

/* Qualification logic for 2026 (48-team format):
 *   1st + 2nd of each group → R32 (24 teams)
 *   Best 8 of 3rd-placed teams (across all 12 groups) → R32 (8 teams)
 *   Total: 32 teams advance.
 *
 * For the per-group computation here, we mark:
 *   - position 1 or 2 (group concluded) → "qualified"
 *   - position 3 (group concluded)      → "third-place" (might still advance)
 *   - position 4 (group concluded)      → "eliminated"
 *   - any team while matches remain      → "pending"
 */
function assignQualificationStatus(
  standings: TeamStanding[],
  groupMatches: Match[],
  results: Record<string, MatchResult>
): void {
  const totalMatches = groupMatches.length;
  const finishedMatches = groupMatches.filter(m => results[m.id]).length;
  const groupConcluded = finishedMatches >= totalMatches && totalMatches > 0;

  standings.forEach(s => {
    if (!groupConcluded) {
      /* Even if mathematically already qualified/eliminated, we keep it
       * simple and mark all as pending until the group ends. */
      s.qualificationStatus = "pending";
      return;
    }
    if (s.position === 1 || s.position === 2) s.qualificationStatus = "qualified";
    else if (s.position === 3) s.qualificationStatus = "third-place";
    else s.qualificationStatus = "eliminated";
  });
}

/* ----------------------------------------------------------------------
 * Knockout matches grouped by stage (for the bracket view)
 * ----------------------------------------------------------------------*/
export interface KnockoutMatchView {
  matchId: string;
  stage: StageId;
  utc: string;
  homeCode: string;
  homeName: string;
  homeFlag: string;
  homeIsPlaceholder: boolean;
  awayCode: string;
  awayName: string;
  awayFlag: string;
  awayIsPlaceholder: boolean;
  homeScore: number | null;
  awayScore: number | null;
  result: "home" | "away" | "draw" | null;
  finished: boolean;
}

export function listKnockoutMatches(
  stage: StageId,
  results: Record<string, MatchResult & { homeTeam?: string; awayTeam?: string }>
): KnockoutMatchView[] {
  /* Lazy import to avoid circular dep at module load */
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolveAllStages } = require("./bracket");
  const resolved = resolveAllStages(results);

  return MATCHES
    .filter(m => m.stage === stage)
    .sort((a, b) => +new Date(a.utc) - +new Date(b.utc))
    .map(m => {
      const r = results[m.id];

      /* Try in order:
       *   1. The stored homeTeam/awayTeam fields (set by simulator)
       *   2. The resolved bracket (computed live from standings)
       *   3. The raw placeholder string */
      let homeCode = (r as any)?.homeTeam || resolved[m.id]?.home || m.home;
      let awayCode = (r as any)?.awayTeam || resolved[m.id]?.away || m.away;
      const homeTeam = TEAMS[homeCode];
      const awayTeam = TEAMS[awayCode];

      /* Did we actually resolve to a real team? */
      const homeResolved = !!homeTeam;
      const awayResolved = !!awayTeam;

      const view: KnockoutMatchView = {
        matchId: m.id,
        stage: m.stage,
        utc: m.utc,
        homeCode,
        homeName: homeTeam?.name || homeCode,
        homeFlag: homeTeam?.flag || "🏳️",
        homeIsPlaceholder: !!m.homeIsPlaceholder && !homeResolved,
        awayCode,
        awayName: awayTeam?.name || awayCode,
        awayFlag: awayTeam?.flag || "🏳️",
        awayIsPlaceholder: !!m.awayIsPlaceholder && !awayResolved,
        homeScore: r ? r.home : null,
        awayScore: r ? r.away : null,
        result: null,
        finished: !!r,
      };
      if (r) {
        if (r.home > r.away) view.result = "home";
        else if (r.home < r.away) view.result = "away";
        else view.result = "draw";
      }
      return view;
    });
}

/* ----------------------------------------------------------------------
 * Group letters helper
 * ----------------------------------------------------------------------*/
export function listGroupLetters(): string[] {
  const set = new Set<string>();
  MATCHES.forEach(m => { if (m.stage === "GROUP" && m.group) set.add(m.group); });
  return [...set].sort();
}
