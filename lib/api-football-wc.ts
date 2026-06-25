/* =====================================================================
 * api-football-wc.ts — API-Football (v3.football.api-sports.io)
 *
 * PRIMARY data source for WC 2026 match results, live scores,
 * goal events, and lineups.
 *
 * Set API_FOOTBALL_KEY in Vercel env vars.
 * Optional: API_FOOTBALL_HOST (default: v3.football.api-sports.io)
 *           AF_WC_LEAGUE_ID   (default: 1  — FIFA World Cup)
 *
 * Exported helpers follow the same conventions as thesportsdb.ts so
 * ai-result-fallback.ts can call one then fall back to the other.
 * ===================================================================*/

import { teamCodeFromApiName } from "./team-name-mapper";

// ---- Config ---------------------------------------------------------

function afKey(): string | undefined { return process.env.API_FOOTBALL_KEY; }
function afHost(): string { return process.env.API_FOOTBALL_HOST ?? "v3.football.api-sports.io"; }

export const AF_WC_LEAGUE  = Number(process.env.AF_WC_LEAGUE_ID ?? 1);
export const AF_WC_SEASON  = 2026;

export function hasAfKey(): boolean { return !!afKey(); }

// ---- HTTP helper ----------------------------------------------------

async function afGet(path: string): Promise<any | null> {
  const key = afKey();
  if (!key) return null;
  try {
    const res = await fetch(`https://${afHost()}${path}`, {
      headers: {
        "x-apisports-key": key,
        "Accept": "application/json",
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---- Raw API types --------------------------------------------------

export interface AfFixture {
  fixture: {
    id: number;
    date: string;       // ISO-8601 with offset, e.g. "2026-06-14T19:00:00+00:00"
    status: {
      short: string;    // "NS"|"1H"|"HT"|"2H"|"ET"|"BT"|"P"|"FT"|"AET"|"PEN"|"PST"|"CANC"
      elapsed: number | null;
      extra:   number | null;
    };
    venue: { name: string | null; city: string | null };
  };
  league: {
    id: number;
    round: string;      // "Group Stage - 1", "Round of 16", "Quarter-finals", "Final", …
  };
  teams: {
    home: { id: number; name: string; winner: boolean | null };
    away: { id: number; name: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  score: {
    fulltime:  { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty:   { home: number | null; away: number | null };
  };
}

export interface AfEvent {
  time: { elapsed: number; extra: number | null };
  team: { id: number; name: string };
  player: { id: number; name: string };
  assist: { id: number | null; name: string | null };
  type:   string;   // "Goal" | "Card" | "subst" | "Var"
  detail: string;   // "Normal Goal" | "Own Goal" | "Penalty" | "Yellow Card" | …
}

export interface AfLineupPlayer {
  player: { id: number; name: string; number: number; pos: string; grid: string | null };
}

export interface AfLineup {
  team:        { id: number; name: string };
  formation:   string;
  startXI:     AfLineupPlayer[];
  substitutes: AfLineupPlayer[];
}

// ---- Status helpers -------------------------------------------------

/** Map API-Football status.short → our internal status codes */
export function afStatusNorm(short: string | undefined): string {
  switch ((short ?? "").toUpperCase()) {
    case "1H": return "1H";
    case "HT": return "HT";
    case "2H": return "2H";
    case "ET": return "ET";
    case "BT": return "BT";
    case "P":  return "P";
    case "FT": return "FT";
    case "AET": return "AET";
    case "PEN": return "AP";   // penalty-shootout result
    default:   return "NS";
  }
}

export function afIsFinished(short: string | undefined): boolean {
  return ["FT","AET","PEN"].includes((short ?? "").toUpperCase());
}

export function afIsLive(short: string | undefined): boolean {
  return ["1H","HT","2H","ET","BT","P"].includes((short ?? "").toUpperCase());
}

export function afMinuteLabel(fix: AfFixture): string {
  const s = fix.fixture.status.short?.toUpperCase();
  const el = fix.fixture.status.elapsed;
  const ex = fix.fixture.status.extra;
  switch (s) {
    case "1H":  return el ? `${el}′` : "מחצית 1";
    case "HT":  return "הפסקה";
    case "2H":  return el ? `${el}′` : "מחצית 2";
    case "ET":  return ex ? `${el}+${ex}′` : (el ? `${el}′ הארכה` : "הארכה");
    case "BT":  return "הפסקה (הארכה)";
    case "P":   return "פנדלים";
    case "FT":
    case "AET":
    case "PEN": return "הסתיים";
    default:    return "";
  }
}

/** Final score accounting for AET / penalty */
export function afFinalScore(fix: AfFixture): { home: number; away: number } | null {
  const ft = fix.score.fulltime;
  if (ft.home == null || ft.away == null) return null;
  return { home: ft.home, away: ft.away };
}

// ---- Season fixture cache -------------------------------------------

interface AfSeasonCache { fixtures: AfFixture[]; fetchedAt: number; }
let _afSeasonCache: AfSeasonCache | null = null;
const AF_CACHE_TTL = 2 * 60 * 1000;

/**
 * Fetch all WC 2026 fixtures from API-Football.
 * Cached for 2 minutes (same TTL as TheSportsDB cache).
 */
export async function fetchAfWcFixtures(): Promise<AfFixture[]> {
  const now = Date.now();
  if (_afSeasonCache && now - _afSeasonCache.fetchedAt < AF_CACHE_TTL) {
    return _afSeasonCache.fixtures;
  }
  const data = await afGet(`/fixtures?league=${AF_WC_LEAGUE}&season=${AF_WC_SEASON}`);
  const fixtures: AfFixture[] = data?.response ?? [];
  _afSeasonCache = { fixtures, fetchedAt: now };
  return fixtures;
}

/**
 * Fetch current live scores for WC 2026.
 * Returns an empty array when nothing is live.
 */
export async function fetchAfWcLivescores(): Promise<AfFixture[]> {
  const data = await afGet(`/fixtures?live=all&league=${AF_WC_LEAGUE}`);
  return data?.response ?? [];
}

/**
 * Fetch all goal/card/sub events for a single fixture.
 */
export async function fetchAfEvents(fixtureId: number): Promise<AfEvent[]> {
  const data = await afGet(`/fixtures/events?fixture=${fixtureId}`);
  return data?.response ?? [];
}

/**
 * Fetch starting lineups for a single fixture.
 * Returns [{team, formation, startXI, substitutes}, …] — usually 2 items.
 */
export async function fetchAfLineups(fixtureId: number): Promise<AfLineup[]> {
  const data = await afGet(`/fixtures/lineups?fixture=${fixtureId}`);
  return data?.response ?? [];
}

export function invalidateAfCache(): void { _afSeasonCache = null; }

// ---- Fixture finder -------------------------------------------------

/**
 * Find an API-Football fixture by team codes + date.
 * Accepts ±12 h window. Returns null if not found.
 */
export function findAfFixture(
  fixtures: AfFixture[],
  opts: { homeCode?: string; awayCode?: string; dateISO: string },
): AfFixture | null {
  const targetMs = new Date(opts.dateISO).getTime();

  for (const fix of fixtures) {
    const fixMs = new Date(fix.fixture.date).getTime();
    if (Math.abs(fixMs - targetMs) > 12 * 60 * 60 * 1000) continue;

    if (opts.homeCode && opts.awayCode) {
      const fh = teamCodeFromApiName(fix.teams.home.name);
      const fa = teamCodeFromApiName(fix.teams.away.name);
      if (!fh || !fa) continue;
      const direct  = fh === opts.homeCode && fa === opts.awayCode;
      const swapped = fh === opts.awayCode && fa === opts.homeCode;
      if (!direct && !swapped) continue;
    }

    return fix;
  }
  return null;
}

/** True when the API-Football home team matches our homeCode. */
export function afIsHomeFirst(fix: AfFixture, homeCode: string | undefined): boolean {
  if (!homeCode) return true;
  const fh = teamCodeFromApiName(fix.teams.home.name);
  return !fh || fh === homeCode;
}

// ---- Knockout round helpers -----------------------------------------

/**
 * Returns true when the API-Football round string is a knockout stage.
 * AF uses: "Round of 16", "Quarter-finals", "Semi-finals",
 *          "3rd Place Final", "Final", (and "Round of 32" if WC 2026).
 */
export function afIsKnockoutRound(round: string | undefined): boolean {
  if (!round) return false;
  const r = round.toLowerCase();
  if (r.startsWith("group stage")) return false;
  return /round of|quarter|semi|final|3rd|third|play.?off/i.test(r);
}

/** Sort-order for AF round strings */
export function afRoundOrder(round: string): number {
  const r = round.toLowerCase();
  if (/round of 32/i.test(r)) return 1;
  if (/round of 16/i.test(r)) return 2;
  if (/quarter/i.test(r)) return 3;
  if (/semi/i.test(r)) return 4;
  if (/3rd|third/i.test(r)) return 5;
  if (/final/i.test(r)) return 6;
  return 99;
}

/** Hebrew display title for AF round string */
export function afRoundTitle(round: string): string {
  const r = round.toLowerCase();
  if (/round of 32/i.test(r)) return "שלב 32 האחרונות";
  if (/round of 16/i.test(r)) return "שמינית גמר";
  if (/quarter/i.test(r)) return "רבע גמר";
  if (/semi/i.test(r)) return "חצי גמר";
  if (/3rd|third/i.test(r)) return "מקום שלישי";
  if (/final/i.test(r)) return "הגמר";
  return round;
}
