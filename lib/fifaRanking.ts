/* =====================================================================
 * FIFA Men's World Ranking — static snapshot for the 48 World Cup 2026
 * teams, as of 10 June 2026 (source: football-ranking.com live FIFA
 * points calculator). Used ONLY for the AI-generated match previews
 * (real, sourced data — never fabricated).
 *
 * Update this table periodically by re-checking the FIFA ranking site
 * if previews start to look stale.
 * ===================================================================*/

export interface FifaRankingEntry {
  rank: number;
  points: number;
}

export const FIFA_RANKING: Record<string, FifaRankingEntry> = {
  ARG: { rank: 1,  points: 1876.11 },
  ESP: { rank: 2,  points: 1873.87 },
  FRA: { rank: 3,  points: 1870.69 },
  ENG: { rank: 4,  points: 1827.05 },
  POR: { rank: 5,  points: 1766.17 },
  BRA: { rank: 6,  points: 1765.86 },
  MAR: { rank: 7,  points: 1755.44 },
  NED: { rank: 8,  points: 1753.57 },
  BEL: { rank: 9,  points: 1742.23 },
  GER: { rank: 10, points: 1735.77 },
  CRO: { rank: 11, points: 1714.87 },
  COL: { rank: 13, points: 1698.35 },
  MEX: { rank: 14, points: 1687.48 },
  SEN: { rank: 15, points: 1685.24 },
  URU: { rank: 16, points: 1673.07 },
  USA: { rank: 17, points: 1671.24 },
  JPN: { rank: 18, points: 1661.58 },
  SUI: { rank: 19, points: 1650.07 },
  IRN: { rank: 21, points: 1619.58 },
  TUR: { rank: 22, points: 1605.73 },
  ECU: { rank: 23, points: 1598.51 },
  AUT: { rank: 24, points: 1597.41 },
  KOR: { rank: 25, points: 1591.63 },
  AUS: { rank: 27, points: 1579.34 },
  ALG: { rank: 28, points: 1571.04 },
  EGY: { rank: 29, points: 1562.37 },
  CAN: { rank: 30, points: 1559.48 },
  NOR: { rank: 31, points: 1557.44 },
  CIV: { rank: 33, points: 1540.87 },
  PAN: { rank: 34, points: 1539.15 },
  SWE: { rank: 38, points: 1509.79 },
  CZE: { rank: 39, points: 1505.74 },
  PAR: { rank: 40, points: 1505.35 },
  SCO: { rank: 42, points: 1503.34 },
  COD: { rank: 45, points: 1477.06 },
  TUN: { rank: 46, points: 1476.40 },
  IRQ: { rank: 56, points: 1451.16 },
  QAT: { rank: 57, points: 1450.31 },
  RSA: { rank: 60, points: 1432.71 },
  KSA: { rank: 61, points: 1422.71 },
  JOR: { rank: 63, points: 1387.73 },
  BIH: { rank: 64, points: 1387.22 },
  CPV: { rank: 67, points: 1371.11 },
  GHA: { rank: 73, points: 1346.88 },
  CUW: { rank: 82, points: 1294.77 },
  HAI: { rank: 83, points: 1293.09 },
  NZL: { rank: 85, points: 1275.58 },
  UZB: { rank: 50, points: 1458.73 },
};

/** FIFA ranking entry for a team code, or null if unknown. */
export function fifaRankingFor(teamCode: string | undefined | null): FifaRankingEntry | null {
  if (!teamCode) return null;
  return FIFA_RANKING[teamCode] || null;
}

/** Source/date label shown alongside ranking-derived content. */
export const FIFA_RANKING_AS_OF = "10 ביוני 2026";
