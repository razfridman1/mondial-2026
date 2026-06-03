/* =====================================================================
 * Team Dossier helpers — compute, for a single national team:
 *   - every match it plays (group + resolved knockout) with results
 *   - its results "so far" (finished matches since the tournament start)
 *   - its current tournament status (which stage / eliminated / champion)
 *
 * Pure functions on top of the standings + bracket engines. Used by the
 * "הנבחרות שלי" (My Teams) tab.
 * ===================================================================*/
import { MATCHES, TEAMS, STAGES } from "./data";
import { computeGroupStandings, type MatchResult } from "./standings";
import type { ResolvedBracket } from "./standings";
import type { StageId } from "./types";

export type TeamResultChar = "W" | "D" | "L";

export interface TeamMatchView {
  matchId: string;
  stage: StageId;
  group: string | null;
  utc: string;
  isHome: boolean;
  opponentCode: string;
  opponentName: string;
  opponentFlag: string;
  opponentResolved: boolean;     // false when opponent is still a bracket placeholder
  scoreFor: number | null;
  scoreAgainst: number | null;
  result: TeamResultChar | null; // for KO, decided by the resolved winner
  finished: boolean;
}

/* All matches that involve `teamCode`, in chronological order. Knockout
 * fixtures are matched via the resolved bracket; unresolved future stages
 * naturally drop out (their placeholders never equal a real team code). */
export function teamMatches(
  teamCode: string,
  results: Record<string, MatchResult>,
  resolved: ResolvedBracket,
): TeamMatchView[] {
  const out: TeamMatchView[] = [];

  for (const m of MATCHES) {
    let homeCode: string;
    let awayCode: string;
    if (m.stage === "GROUP") {
      homeCode = m.home;
      awayCode = m.away;
    } else {
      const rb = resolved[m.id];
      homeCode = rb?.home || m.home;
      awayCode = rb?.away || m.away;
    }

    if (homeCode !== teamCode && awayCode !== teamCode) continue;

    const isHome = homeCode === teamCode;
    const opponentCode = isHome ? awayCode : homeCode;
    const opp = TEAMS[opponentCode];
    const r = results[m.id];

    let scoreFor: number | null = null;
    let scoreAgainst: number | null = null;
    let result: TeamResultChar | null = null;

    if (r) {
      scoreFor = isHome ? r.home : r.away;
      scoreAgainst = isHome ? r.away : r.home;
      if (m.stage === "GROUP") {
        result = scoreFor > scoreAgainst ? "W" : scoreFor === scoreAgainst ? "D" : "L";
      } else {
        const rb = resolved[m.id];
        const winner =
          rb?.winner ||
          (r.home > r.away ? homeCode : r.home < r.away ? awayCode : "");
        result = winner === teamCode ? "W" : winner ? "L" : null;
      }
    }

    out.push({
      matchId: m.id,
      stage: m.stage,
      group: m.group,
      utc: m.utc,
      isHome,
      opponentCode,
      opponentName: opp?.name || opponentCode,
      opponentFlag: opp?.flag || "🏳️",
      opponentResolved: !!opp,
      scoreFor,
      scoreAgainst,
      result,
      finished: !!r,
    });
  }

  return out.sort((a, b) => +new Date(a.utc) - +new Date(b.utc));
}

export type TeamStatusKind =
  | "pending"     // tournament not started for this team
  | "group"       // still in group stage
  | "active"      // advanced, awaiting / playing a knockout round
  | "eliminated"
  | "third"       // won 3rd-place game
  | "fourth"      // lost 3rd-place game
  | "runnerup"    // lost the final
  | "champion";

export interface TeamStatus {
  kind: TeamStatusKind;
  stage: StageId;
  label: string;     // short Hebrew label
  detail?: string;   // optional extra context
}

const KO_ORDER: StageId[] = ["R32", "R16", "QF", "SF"];

/* Current standing of a team in the tournament, derived from finished
 * matches + the resolved bracket. */
export function teamStatus(
  teamCode: string,
  results: Record<string, MatchResult>,
  resolved: ResolvedBracket,
): TeamStatus {
  const matches = teamMatches(teamCode, results, resolved);

  /* Final / 3rd-place outcomes first. */
  const finalMatch = matches.find(m => m.stage === "FINAL");
  if (finalMatch?.finished) {
    return finalMatch.result === "W"
      ? { kind: "champion", stage: "FINAL", label: "🏆 אלופת העולם!" }
      : { kind: "runnerup", stage: "FINAL", label: "🥈 סגנית אלופה" };
  }
  const thirdMatch = matches.find(m => m.stage === "THIRD");
  if (thirdMatch?.finished) {
    return thirdMatch.result === "W"
      ? { kind: "third", stage: "THIRD", label: "🥉 מקום שלישי" }
      : { kind: "fourth", stage: "THIRD", label: "מקום רביעי" };
  }

  /* Deepest finished knockout round. */
  let lastFinishedKO: TeamMatchView | null = null;
  for (const st of KO_ORDER) {
    const mm = matches.find(m => m.stage === st && m.finished);
    if (mm) lastFinishedKO = mm;
  }
  if (lastFinishedKO && lastFinishedKO.result === "L") {
    /* SF loser still has the 3rd-place game ahead. */
    if (lastFinishedKO.stage === "SF" && thirdMatch && !thirdMatch.finished) {
      return { kind: "active", stage: "THIRD", label: "ממתינה למשחק על המקום השלישי" };
    }
    return {
      kind: "eliminated",
      stage: lastFinishedKO.stage,
      label: `הודחה ב${STAGES[lastFinishedKO.stage].name}`,
    };
  }

  /* An upcoming (resolved, unplayed) knockout fixture → still alive. */
  const upcomingKO = matches.find(m => m.stage !== "GROUP" && !m.finished);
  if (upcomingKO) {
    return {
      kind: "active",
      stage: upcomingKO.stage,
      label: `עלתה ל${STAGES[upcomingKO.stage].name}`,
      detail: upcomingKO.opponentResolved ? `נגד ${upcomingKO.opponentName}` : undefined,
    };
  }

  /* Otherwise resolve via the group standing. */
  const team = TEAMS[teamCode];
  const group = team?.group;
  if (!group) return { kind: "pending", stage: "GROUP", label: "טרם החל" };

  const standings = computeGroupStandings(group, results);
  const st = standings.find(s => s.teamCode === teamCode);
  if (!st || st.played === 0) {
    return { kind: "pending", stage: "GROUP", label: "טרם שיחקה" };
  }
  if (st.qualificationStatus === "eliminated") {
    return { kind: "eliminated", stage: "GROUP", label: "הודחה בשלב הבתים" };
  }
  if (st.qualificationStatus === "qualified") {
    return { kind: "active", stage: "GROUP", label: "העפילה משלב הבתים", detail: `מקום ${st.position} בבית ${group}` };
  }
  if (st.qualificationStatus === "third-place") {
    return { kind: "active", stage: "GROUP", label: "סיימה 3 בבית — ממתינה להעפלה כשלישית", detail: `בית ${group}` };
  }
  /* In-progress group stage. */
  return {
    kind: "group",
    stage: "GROUP",
    label: `שלב הבתים · מקום ${st.position} בבית ${group}`,
    detail: `${st.played}/3 משחקים · ${st.points} נק׳`,
  };
}
