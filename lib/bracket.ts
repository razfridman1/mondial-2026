/* =====================================================================
 * Bracket Resolver — resolves knockout-stage placeholders to actual teams
 * based on current group standings + previous knockout results.
 *
 * Placeholder formats used in MATCHES data:
 *   "1A"          → winner of group A
 *   "2B"          → runner-up of group B
 *   "3A/C/D/E"    → one of the third-placed teams from groups A/C/D/E
 *                   (the best qualifying one — top 8 across all groups)
 *   "W R32-N"     → winner of the N-th R32 match (1-indexed)
 *   "L SF-N"      → loser of the N-th SF match (used in 3rd-place game)
 *   "W SF-N"      → winner of the N-th SF match (used in final)
 *   "W R16-N"     → winner of the N-th R16 match
 *   "W QF-N"      → winner of the N-th QF match
 * ===================================================================*/

import { MATCHES, TEAMS } from "./data";
import { computeGroupStandings, type MatchResult, type TeamStanding } from "./standings";
import type { Match, StageId } from "./types";

const ALL_GROUPS = "ABCDEFGHIJKL".split("");

/** Pick the 8 best third-placed teams across all 12 groups, per FIFA tiebreakers. */
export function bestEightThirdPlaced(results: Record<string, MatchResult>): TeamStanding[] {
  const thirds: TeamStanding[] = [];
  for (const g of ALL_GROUPS) {
    const standings = computeGroupStandings(g, results);
    const third = standings[2];           /* index 2 = third place */
    if (third && third.played > 0) thirds.push(third);
  }
  thirds.sort((a, b) =>
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    a.teamCode.localeCompare(b.teamCode));
  return thirds.slice(0, 8);
}

/** True if every group's 3 matches are played. */
export function groupStageComplete(results: Record<string, MatchResult>): boolean {
  const groupMatches = MATCHES.filter(m => m.stage === "GROUP");
  return groupMatches.every(m => results[m.id]);
}

/** True if every match in `stage` has a result. */
export function stageComplete(stage: StageId, results: Record<string, MatchResult>): boolean {
  const ms = MATCHES.filter(m => m.stage === stage);
  return ms.length > 0 && ms.every(m => results[m.id]);
}

/** Index a stage's matches so "W R32-1" can map to the 1st R32 match. */
function listStageMatchesOrdered(stage: StageId): Match[] {
  return MATCHES.filter(m => m.stage === stage)
    .sort((a, b) => +new Date(a.utc) - +new Date(b.utc));
}

/** Resolve a single placeholder string to an actual team code (or null).
 *  `usedTeams` (optional) lets callers track which teams have already been
 *  assigned within the current stage resolution pass — preventing the same
 *  third-placed team from being picked for multiple R32 slots. */
export function resolvePlaceholder(
  placeholder: string,
  results: Record<string, MatchResult>,
  resolvedByMatchId: Record<string, { home: string; away: string; winner: string; loser: string }>,
  usedTeams?: Set<string>,
): string | null {
  if (!placeholder) return null;
  const ph = placeholder.trim();

  /* "1A" / "2B" — group position. */
  const groupPos = /^([12])([A-L])$/.exec(ph);
  if (groupPos) {
    const pos = parseInt(groupPos[1], 10) - 1;
    const standings = computeGroupStandings(groupPos[2], results);
    const code = standings[pos]?.teamCode || null;
    if (code && usedTeams) usedTeams.add(code);
    return code;
  }

  /* "3A/C/D/E" — third-placed from one of those groups, picking the best
   * qualifying one that hasn't already been assigned to another slot. */
  const thirdsPattern = /^3([A-Z\/]+)$/.exec(ph);
  if (thirdsPattern) {
    const groups = thirdsPattern[1].split("/");
    const eight = bestEightThirdPlaced(results);
    /* Find the highest-ranked qualifying 3rd-placed team from the allowed
     * groups that hasn't been picked yet in this resolution pass. */
    for (const t of eight) {
      if (usedTeams?.has(t.teamCode)) continue;
      const teamGroup = MATCHES.find(m =>
        m.stage === "GROUP" && (m.home === t.teamCode || m.away === t.teamCode)
      )?.group;
      if (teamGroup && groups.includes(teamGroup)) {
        usedTeams?.add(t.teamCode);
        return t.teamCode;
      }
    }
    return null;
  }

  /* "W R32-N", "W R16-N", "W QF-N", "W SF-N" — winner of stage's N-th match. */
  const winM = /^W\s+(R32|R16|QF|SF)-(\d+)$/.exec(ph);
  if (winM) {
    const stage = winM[1] as StageId;
    const idx = parseInt(winM[2], 10) - 1;
    const ms = listStageMatchesOrdered(stage);
    const m = ms[idx];
    if (!m) return null;
    return resolvedByMatchId[m.id]?.winner || null;
  }

  /* "L SF-N" — loser of SF match. */
  const lossM = /^L\s+(SF)-(\d+)$/.exec(ph);
  if (lossM) {
    const stage = lossM[1] as StageId;
    const idx = parseInt(lossM[2], 10) - 1;
    const ms = listStageMatchesOrdered(stage);
    const m = ms[idx];
    if (!m) return null;
    return resolvedByMatchId[m.id]?.loser || null;
  }

  /* If the placeholder is already a real team code (3-letter), return it as-is. */
  if (TEAMS[ph]) return ph;

  return null;
}

/** Resolve every match in stage order, building up the resolved table as we go.
 *
 * STRICT GATING: A stage's placeholders are only resolved when the FULL
 * previous stage is completed. This matches FIFA: R32 brackets are only
 * determined once all 72 group games are played; R16 only after all 16
 * R32 games; and so on.
 *
 * If a stage is not yet unlocked, its entries are simply absent from the
 * returned table, so callers fall back to the placeholder string ("1A").
 */
export function resolveAllStages(
  results: Record<string, MatchResult>
): Record<string, { home: string; away: string; winner: string; loser: string }> {
  const out: Record<string, { home: string; away: string; winner: string; loser: string }> = {};

  /* Group matches: home/away are already real codes; winner determined by result. */
  for (const m of MATCHES.filter(m => m.stage === "GROUP")) {
    const r = results[m.id];
    if (!r) continue;
    const winner = r.home > r.away ? m.home : r.home < r.away ? m.away : "";
    const loser  = r.home > r.away ? m.away : r.home < r.away ? m.home : "";
    out[m.id] = { home: m.home, away: m.away, winner, loser };
  }

  /* Knockouts must wait for the FULL previous stage to be complete.
   * Each iteration of this loop is gated on the previous stage. */
  const ORDER: StageId[] = ["R32", "R16", "QF", "SF", "THIRD", "FINAL"];
  const PREV: Record<StageId, StageId | "GROUP"> = {
    GROUP: "GROUP",
    R32:   "GROUP",
    R16:   "R32",
    QF:    "R16",
    SF:    "QF",
    THIRD: "SF",
    FINAL: "SF",
  };

  for (const stage of ORDER) {
    /* Gate: must have ALL results of the previous stage. */
    const prev = PREV[stage];
    if (!stageComplete(prev as StageId, results)) {
      /* Previous stage isn't fully done — leave this stage's placeholders unresolved. */
      continue;
    }
    /* Track teams already assigned in this stage so we don't reuse the same
     * 3rd-placed team across multiple R32 slots. New Set per stage so QF/SF
     * can reuse the same winners as needed. */
    const usedTeams = new Set<string>();
    for (const m of listStageMatchesOrdered(stage)) {
      const homeCode = resolvePlaceholder(m.home, results, out, usedTeams) || m.home;
      const awayCode = resolvePlaceholder(m.away, results, out, usedTeams) || m.away;
      const r = results[m.id];
      if (r) {
        let winner = "", loser = "";
        if (r.home > r.away) { winner = homeCode; loser = awayCode; }
        else if (r.home < r.away) { winner = awayCode; loser = homeCode; }
        else {
          /* tie in knockout — pick winner deterministically by alphabet, for sim purposes */
          if (homeCode < awayCode) { winner = homeCode; loser = awayCode; }
          else { winner = awayCode; loser = homeCode; }
        }
        out[m.id] = { home: homeCode, away: awayCode, winner, loser };
      } else {
        out[m.id] = { home: homeCode, away: awayCode, winner: "", loser: "" };
      }
    }
  }

  return out;
}
