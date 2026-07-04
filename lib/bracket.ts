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

/** Resolve every match progressively — each match is resolved as soon as its
 * prerequisite data is available, without waiting for the full previous stage.
 *
 * e.g. once groups A and B finish, the R32 match "1A vs 2B" shows the real
 * teams immediately; we don't wait for all 72 group matches to complete.
 */
export function resolveAllStages(
  results: Record<string, MatchResult>
): Record<string, { home: string; away: string; winner: string; loser: string }> {
  const out: Record<string, { home: string; away: string; winner: string; loser: string }> = {};

  /* Group matches: straightforward — real codes, winner from score. */
  for (const m of MATCHES.filter(m => m.stage === "GROUP")) {
    const r = results[m.id];
    if (!r) continue;
    const winner = r.home > r.away ? m.home : r.home < r.away ? m.away : "";
    const loser  = r.home > r.away ? m.away : r.home < r.away ? m.home : "";
    out[m.id] = { home: m.home, away: m.away, winner, loser };
  }

  /* Knockouts: process stage by stage so that each stage can reference the
   * winners already placed in `out` from the previous stage. No global gate —
   * each match resolves independently as soon as its inputs are known. */
  const ORDER: StageId[] = ["R32", "R16", "QF", "SF", "THIRD", "FINAL"];

  for (const stage of ORDER) {
    /* For R32 we pre-compute the 8 best 3rd-placed teams once per stage pass
     * so slots don't clash. We still do this even if the group stage isn't
     * 100% complete — partial standings are used, giving the best available guess. */
    const usedTeams = new Set<string>();
    const eightThirds = stage === "R32" ? bestEightThirdPlaced(results).map(t => t.teamCode) : [];
    function relaxedThird(): string | null {
      for (const code of eightThirds) {
        if (!usedTeams.has(code)) { usedTeams.add(code); return code; }
      }
      return null;
    }

    for (const m of listStageMatchesOrdered(stage)) {
      let homeCode = resolvePlaceholder(m.home, results, out, usedTeams) || "";
      let awayCode = resolvePlaceholder(m.away, results, out, usedTeams) || "";
      if (!homeCode && /^3[A-Z\/]+$/.test(m.home)) homeCode = relaxedThird() || "";
      if (!awayCode && /^3[A-Z\/]+$/.test(m.away)) awayCode = relaxedThird() || "";
      if (!homeCode && TEAMS[m.home]) homeCode = m.home;
      if (!awayCode && TEAMS[m.away]) awayCode = m.away;

      const r = results[m.id];
      if (r) {
        let winner = "", loser = "";
        if (r.winner && (r.winner === homeCode || r.winner === awayCode)) {
          winner = r.winner;
          loser = winner === homeCode ? awayCode : homeCode;
        } else if (r.home > r.away) { winner = homeCode; loser = awayCode; }
        else if (r.home < r.away)   { winner = awayCode; loser = homeCode; }
        else {
          if (homeCode < awayCode) { winner = homeCode; loser = awayCode; }
          else                     { winner = awayCode; loser = homeCode; }
        }
        out[m.id] = { home: homeCode, away: awayCode, winner, loser };
      } else {
        /* Match not yet played — store teams if known so the card shows them */
        if (homeCode || awayCode) {
          out[m.id] = { home: homeCode, away: awayCode, winner: "", loser: "" };
        }
      }
    }
  }

  return out;
}

/** Returns a copy of `results` where every match's `winner` field is
 * overwritten with the value `resolveAllStages` derives from the real
 * resolved teams + score, instead of whatever raw string is stored in the
 * match_results doc.
 *
 * Why this matters: when a knockout result is saved WITHOUT an explicit
 * winner (e.g. admin only fills in the score), some code paths fall back
 * to deriving `winner` from the match's placeholder codes at save time —
 * which, for a knockout match, can end up storing the raw bracket
 * placeholder string ("W R32-4") instead of the real team code ("MAR").
 * That placeholder can never equal a real predictedWinner team code, so
 * EVERY prediction for that match — including correct ones — silently
 * scores 0 points. `resolveAllStages` already only trusts a stored
 * `winner` when it matches one of the two real resolved team codes,
 * otherwise it re-derives the winner from the score — so reapplying its
 * output here self-heals the bug at read time, for any already-corrupted
 * match_results doc, with no data migration needed. */
export function withResolvedWinners<T extends { winner?: string }>(
  results: Record<string, T>
): Record<string, T> {
  const resolved = resolveAllStages(results as unknown as Record<string, MatchResult>);
  const out: Record<string, T> = {};
  for (const [id, r] of Object.entries(results)) {
    const w = resolved[id]?.winner;
    out[id] = w ? { ...r, winner: w } : r;
  }
  return out;
}
