/* =====================================================================
 * TheSportsDB API integration — PRIMARY source for WC 2026 data.
 *
 * Set THESPORTSDB_API_KEY in Vercel env vars to your premium key.
 *
 * WC 2026 league ID: 4429  ("FIFA World Cup")
 * Season string:     "2026"
 *
 * V1 API: key embedded in URL path, returns JSON with named keys.
 * V2 API: key in X-API-KEY header, premium-only (livescores, etc.).
 * ===================================================================*/

// ---- Config ---------------------------------------------------------

const BASE_V1 = "https://www.thesportsdb.com/api/v1/json";
const BASE_V2 = "https://www.thesportsdb.com/api/v2/json";
export const TSDB_WC_LEAGUE_ID = "4429";
const WC_SEASON = "2026";

function apiKey(): string | undefined {
  return process.env.THESPORTSDB_API_KEY;
}

export function hasTsdbKey(): boolean {
  return !!apiKey();
}

// ---- Raw types ------------------------------------------------------

export interface TsdbEvent {
  idEvent: string;
  idAPIfootball?: string;
  strTimestamp?: string; // "2026-06-11T19:00:00" (UTC, no Z)
  dateEvent?: string;    // "2026-06-11"
  strTime?: string;      // "19:00:00"
  strEvent?: string;     // "Mexico vs South Africa"
  strHomeTeam?: string;
  strAwayTeam?: string;
  idHomeTeam?: string;
  idAwayTeam?: string;
  intHomeScore?: string | number | null;
  intAwayScore?: string | number | null;
  strStatus?: string;    // "NS"|"1H"|"HT"|"2H"|"ET"|"P"|"FT"|"AET"|"AP"
  strGroup?: string;
  strRound?: string | number;
  idLeague?: string;
  strLeague?: string;
}

export interface TsdbTimelineEntry {
  idTimeline?: string;
  idEvent?: string;
  strTimeline?: string;      // "Goal" | "subst" | "Yellow Card" | ...
  strTimelineDetail?: string;// "Normal Goal" | "Own Goal" | "Penalty" | ...
  strHome?: string;          // "Yes" = home team, "No" = away team
  strPlayer?: string;
  idPlayer?: string;
  strAssist?: string;
  idAssist?: string;
  intTime?: string | number; // minute
  idTeam?: string;
  strTeam?: string;
}

export interface TsdbLineupEntry {
  idLineup?: string;
  idEvent?: string;
  strPosition?: string;
  strPositionShort?: string; // "G" | "D" | "M" | "F"
  strHome?: string;          // "Yes" = home team
  strSubstitute?: string;    // "Yes" = sub, "No" = starter
  intSquadNumber?: string | number;
  strPlayer?: string;
  idPlayer?: string;
  idTeam?: string;
  strTeam?: string;
  strFormation?: string | null;
}

// ---- HTTP helpers ---------------------------------------------------

async function v1Get(path: string): Promise<any | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const r = await fetch(`${BASE_V1}/${key}${path}`, {
      headers: { "Accept": "application/json" },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function v2Get(path: string): Promise<any | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const r = await fetch(`${BASE_V2}${path}`, {
      headers: { "X-API-KEY": key, "Accept": "application/json" },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// ---- Module-level season cache (2 min TTL) -------------------------

interface SeasonCache {
  events: TsdbEvent[];
  fetchedAt: number;
}

let _seasonCache: SeasonCache | null = null;
const SEASON_CACHE_TTL = 2 * 60 * 1000;

/**
 * Fetch all FIFA World Cup 2026 events from TheSportsDB.
 * Tries V2 full-season schedule first (premium), falls back to V1.
 * Cached for 2 minutes to avoid hammering the API on every sync tick.
 */
export async function fetchTsdbWcEvents(): Promise<TsdbEvent[]> {
  const now = Date.now();
  if (_seasonCache && now - _seasonCache.fetchedAt < SEASON_CACHE_TTL) {
    return _seasonCache.events;
  }

  // V2 full season schedule (premium endpoint)
  const v2 = await v2Get(`/schedule/league/${TSDB_WC_LEAGUE_ID}/${WC_SEASON}`);
  if (v2?.schedule && Array.isArray(v2.schedule) && v2.schedule.length > 0) {
    const events: TsdbEvent[] = v2.schedule;
    _seasonCache = { events, fetchedAt: now };
    return events;
  }

  // V1 season events fallback
  const v1 = await v1Get(`/eventsseason.php?id=${TSDB_WC_LEAGUE_ID}&s=${WC_SEASON}`);
  if (v1?.events && Array.isArray(v1.events) && v1.events.length > 0) {
    const events: TsdbEvent[] = v1.events;
    _seasonCache = { events, fetchedAt: now };
    return events;
  }

  return [];
}

/** Invalidate the season cache (call after writing a result so the next
 *  sync sees the updated status from the API immediately). */
export function invalidateTsdbCache(): void {
  _seasonCache = null;
}

// ---- Per-event lookups (not cached here — callers should cache) -----

/**
 * Fetch the full timeline for a single event (goals, subs, cards).
 * Filters to goals only by default (pass false to get everything).
 */
export async function fetchTsdbTimeline(idEvent: string): Promise<TsdbTimelineEntry[]> {
  const data = await v1Get(`/lookuptimeline.php?id=${idEvent}`);
  return Array.isArray(data?.lookup) ? data.lookup : [];
}

/**
 * Fetch the starting lineups for a single event.
 * Returns all entries (starters + subs); filter by strSubstitute === "No"
 * for the starting XI.
 */
export async function fetchTsdbLineup(idEvent: string): Promise<TsdbLineupEntry[]> {
  const data = await v1Get(`/lookuplineup.php?id=${idEvent}`);
  return Array.isArray(data?.lookup) ? data.lookup : [];
}

/**
 * Fetch current live scores for WC 2026 (V2 premium endpoint).
 * Returns empty array if not available or no matches live.
 */
export async function fetchTsdbLivescores(): Promise<TsdbEvent[]> {
  const data = await v2Get(`/livescore/${TSDB_WC_LEAGUE_ID}`);
  // V2 livescore response key may vary — handle both shapes
  const list = data?.livescore || data?.events || data?.schedule || [];
  return Array.isArray(list) ? list : [];
}

// ---- Helper: parse score safely ------------------------------------

/** Parse a TheSportsDB score field (may be string "2", number 2, or null) */
export function parseTsdbScore(val: string | number | null | undefined): number | null {
  if (val == null) return null;
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** TheSportsDB status → is the match finished? */
export function tsdbIsFinished(status: string | undefined): boolean {
  if (!status) return false;
  return ["FT", "AET", "AP"].includes(status.toUpperCase());
}

/** TheSportsDB status → is the match live/in-progress? */
export function tsdbIsLive(status: string | undefined): boolean {
  if (!status) return false;
  return ["1H", "HT", "2H", "ET", "P", "BT"].includes(status.toUpperCase());
}

/** TheSportsDB status → Hebrew minute label for the live ticker. */
export function tsdbMinuteLabel(status: string | undefined): string {
  switch ((status || "").toUpperCase()) {
    case "1H": return "מחצית ראשונה";
    case "HT": return "הפסקה";
    case "2H": return "מחצית שניה";
    case "ET": return "הארכה";
    case "P":  return "פנדלים";
    case "FT":
    case "AET":
    case "AP": return "הסתיים";
    default:   return "בשידור חי";
  }
}
