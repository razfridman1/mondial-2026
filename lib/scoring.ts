/* =====================================================================
 * Scoring engine — assigns points per finished match.
 *
 * Group stage:
 *   exact score              : 7 pts
 *   correct result + dir     : 3 pts (winner/draw correct, exact off)
 *   correct goal diff        : +1 pt (added to the 3, ONLY if actual diff >= 1)
 *                              Draws never earn the diff bonus.
 *   no prediction            : 0 pts
 *
 * Knockout stage (no draws — winner decided in ET/penalties if needed):
 *   exact 90-min score + winner : 8 pts
 *   correct winner + goal diff  : 5 pts (must be the same diff at 90 mins)
 *   correct winner only         : 3 pts
 *   wrong winner                : 0 pts
 *
 * Streak: every consecutive match with any correct prediction +1 bonus.
 * ===================================================================*/

export interface ScoreInput {
  predictedHome: number | null;
  predictedAway: number | null;
  actualHome:    number | null;
  actualAway:    number | null;
  /* Knockout-only: which team the user picked to advance (and which one
   * actually advanced after ET/pens). For group stage these are ignored. */
  predictedWinner?: string | null;
  actualWinner?:    string | null;
  isKnockout?:      boolean;
}

export interface ScoreBreakdown {
  exact: boolean;
  resultCorrect: boolean;
  diffCorrect: boolean;
  points: number;
}

export function scorePrediction(s: ScoreInput): ScoreBreakdown {
  if (s.predictedHome == null || s.predictedAway == null) {
    return { exact: false, resultCorrect: false, diffCorrect: false, points: 0 };
  }
  if (s.actualHome == null || s.actualAway == null) {
    return { exact: false, resultCorrect: false, diffCorrect: false, points: 0 };
  }

  /* --------- KNOCKOUT SCORING --------- */
  if (s.isKnockout) {
    /* Need to know the actual winner. If not given, derive from score
     * (works when there's no 90-min tie). */
    const actualWinnerCode = s.actualWinner
      ?? (s.actualHome > s.actualAway ? "_HOME"
        : s.actualHome < s.actualAway ? "_AWAY"
        : null);
    const predictedWinnerCode = s.predictedWinner
      ?? (s.predictedHome > s.predictedAway ? "_HOME"
        : s.predictedHome < s.predictedAway ? "_AWAY"
        : null);

    /* Winner missing on either side → no points possible. */
    if (!actualWinnerCode || !predictedWinnerCode) {
      return { exact: false, resultCorrect: false, diffCorrect: false, points: 0 };
    }
    const winnerCorrect = predictedWinnerCode === actualWinnerCode;
    if (!winnerCorrect) {
      return { exact: false, resultCorrect: false, diffCorrect: false, points: 0 };
    }
    /* Exact 90-min score AND correct winner → 8 pts */
    const exact = s.predictedHome === s.actualHome && s.predictedAway === s.actualAway;
    if (exact) {
      return { exact: true, resultCorrect: true, diffCorrect: true, points: 8 };
    }
    /* Goal-diff bonus: predicted (signed) diff at 90 mins matches actual.
     * Only counts when at least one side had a non-zero diff (excludes 0-0
     * predicted vs 0-0 actual, where exact would have caught it above). */
    const actualDiff = s.actualHome - s.actualAway;
    const predDiff   = s.predictedHome - s.predictedAway;
    const diffCorrect = predDiff === actualDiff;
    return {
      exact: false,
      resultCorrect: true,
      diffCorrect,
      points: diffCorrect ? 5 : 3,
    };
  }

  /* --------- GROUP-STAGE SCORING (default) --------- */
  const exact = s.predictedHome === s.actualHome && s.predictedAway === s.actualAway;
  const predResult =
    s.predictedHome > s.predictedAway ? "H" :
    s.predictedHome < s.predictedAway ? "A" : "D";
  const actualResult =
    s.actualHome > s.actualAway ? "H" :
    s.actualHome < s.actualAway ? "A" : "D";
  const resultCorrect = predResult === actualResult;
  /* Goal-diff bonus applies ONLY when the actual diff is >= 1 (i.e. not a draw). */
  const actualDiff = s.actualHome - s.actualAway;
  const predDiff   = s.predictedHome - s.predictedAway;
  const diffCorrect = actualDiff !== 0 && predDiff === actualDiff;

  let points = 0;
  if (exact) points = 7;
  else if (resultCorrect) {
    points = 3;
    if (diffCorrect) points += 1;
  }
  return { exact, resultCorrect, diffCorrect, points };
}

/* Recompute totals for a user given all their predictions and match results.
 * Streak resets when a prediction earns 0 pts. */
export function userTotals(
  preds: Array<{
    matchId: string;
    homeScore: number;
    awayScore: number;
    predictedWinner?: string;
    joker?: boolean;
    isKnockout?: boolean;
  }>,
  results: Record<string, {
    home: number; away: number; finishedAt: number;
    winner?: string;
    isKnockout?: boolean;
  }>,
  bonusPoints: number = 0,
) {
  let total = 0, exact = 0, result = 0, streak = 0, currentStreak = 0;
  // sort predictions by finish time
  const finished = preds
    .map(p => ({ p, r: results[p.matchId] }))
    .filter(x => x.r)
    .sort((a, b) => a.r.finishedAt - b.r.finishedAt);

  for (const { p, r } of finished) {
    const isKO = p.isKnockout || r.isKnockout;
    const sc = scorePrediction({
      predictedHome: p.homeScore, predictedAway: p.awayScore,
      actualHome: r.home, actualAway: r.away,
      predictedWinner: p.predictedWinner ?? null,
      actualWinner: r.winner ?? null,
      isKnockout: isKO,
    });
    const pts = sc.points;
    total += pts;
    if (sc.exact) exact++;
    if (sc.resultCorrect) result++;
    if (pts > 0) {
      currentStreak++;
      total += 1; // streak bonus per match
      if (currentStreak > streak) streak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  /* Manual bonus points awarded by admin (can be positive or negative). */
  total += bonusPoints;

  return {
    totalPoints: total,
    exactCount: exact,
    resultCount: result,
    predictionsCount: preds.length,
    streak,
    jokersHit: 0,
    bonusPoints,
  };
}
