/* =====================================================================
 * Scoring engine — assigns points per finished match.
 *   exact score         : 7 pts
 *   correct result + dir: 3 pts (winner/draw correct, exact off)
 *   correct goal diff   : +1 pt (added to the 3 if applicable)
 *   no prediction       : 0 pts
 * Streak: every consecutive match with any correct prediction +1 bonus.
 * Joker (legacy field) is now ignored — all predictions count ×1.
 * ===================================================================*/

export interface ScoreInput {
  predictedHome: number | null;
  predictedAway: number | null;
  actualHome: number | null;
  actualAway: number | null;
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
  const exact = s.predictedHome === s.actualHome && s.predictedAway === s.actualAway;
  const predResult =
    s.predictedHome > s.predictedAway ? "H" :
    s.predictedHome < s.predictedAway ? "A" : "D";
  const actualResult =
    s.actualHome > s.actualAway ? "H" :
    s.actualHome < s.actualAway ? "A" : "D";
  const resultCorrect = predResult === actualResult;
  const diffCorrect = (s.predictedHome - s.predictedAway) === (s.actualHome - s.actualAway);

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
  preds: Array<{ matchId: string; homeScore: number; awayScore: number; joker?: boolean }>,
  results: Record<string, { home: number; away: number; finishedAt: number }>,
  bonusPoints: number = 0,
) {
  let total = 0, exact = 0, result = 0, streak = 0, currentStreak = 0;
  // sort predictions by finish time
  const finished = preds
    .map(p => ({ p, r: results[p.matchId] }))
    .filter(x => x.r)
    .sort((a, b) => a.r.finishedAt - b.r.finishedAt);

  for (const { p, r } of finished) {
    const sc = scorePrediction({
      predictedHome: p.homeScore, predictedAway: p.awayScore,
      actualHome: r.home, actualAway: r.away,
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
