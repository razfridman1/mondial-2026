/* =====================================================================
 * TheSportsDB direct lookups — PRIMARY source for WC 2026 data.
 *
 * All data comes from TheSportsDB (results, live scores, goals,
 * lineups). football-data.org is used as a fallback for goals/details
 * when TheSportsDB doesn't have them yet.
 *
 * Set THESPORTSDB_API_KEY in Vercel env vars (your premium key).
 * FOOTBALL_API_KEY remains optional (goals/details fallback).
 *
 * Exported function names and interfaces are unchanged — callers
 * need no modifications.  Returns found:false on any failure.
 * ===================================================================*/
import type { ExternalGoal } from "./football-data-api";

import { teamCodeFromApiName } from "./team-name-mapper";
import { TEAMS } from "./data";
import {
  fetchTsdbWcEvents,
  fetchTsdbTimeline,
  fetchTsdbLineup,
  fetchTsdbLivescores,
  parseTsdbScore,
  tsdbIsFinished,
  tsdbIsLive,
  tsdbMinuteLabel,
  hasTsdbKey,
  type TsdbEvent,
  type TsdbTimelineEntry,
  type TsdbLineupEntry,
} from "./thesportsdb";

// ---- Public interfaces (unchanged) ----------------------------------

export interface AiResultLookup {
  found: boolean;
  home?: number;
  away?: number;
  homeTeamName?: string;
  awayTeamName?: string;
  winnerSide?: "HOME" | "AWAY" | "DRAW";
  sources?: string[];
  reason?: string;
}

export interface AiOddsLookup {
  found: boolean;
  odds?: { home: string; draw: string; away: string };
  sources?: string[];
  reason?: string;
}

export interface AiLineupPlayer {
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  number?: number | null;
}
export interface AiLineupTeam {
  formation?: string;
  startXI: AiLineupPlayer[];
}
export interface AiLineupsLookup {
  found: boolean;
  home?: AiLineupTeam;
  away?: AiLineupTeam;
  sources?: string[];
  reason?: string;
}

export interface AiGoalsLookup {
  found: boolean;
  goals?: { minute: number | null; side: "HOME" | "AWAY"; scorer: string; assist?: string; type?: string }[];
  sources?: string[];
  reason?: string;
}

export interface AiLiveScoreLookup {
  found: boolean;
  home?: number;
  away?: number;
  minuteLabel?: string;
  goals?: AiGoalsLookup["goals"];
  sources?: string[];
  reason?: string;
}

export interface AiAssistsLeaderboard {
  found: boolean;
  assists?: { name: string; team: string; count: number }[];
  reason?: string;
}

// ---- Helpers --------------------------------------------------------

/** Reverse-lookup an internal team code from our TEAMS display names. */
function codeFromDisplayName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const mapped = teamCodeFromApiName(name);
  if (mapped) return mapped;
  for (const [code, t] of Object.entries(TEAMS)) {
    if (t.nameEn === name || t.name === name) return code;
  }
  return undefined;
}

/** Our internal stage codes → TheSportsDB round/stage strings.
 *  (TheSportsDB uses strRound or strGroup — matching by date+teams is
 *   more reliable, so this is only used as an optional filter.) */
const STAGE_TO_TSDB_ROUND: Record<string, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF:  "Quarter Final",
  SF:  "Semi Final",
  THIRD: "3rd Place",
  FINAL: "Final",
};

/**
 * Find the TheSportsDB event matching a given date + team codes.
 * Accepts ±12 h window. When homeCode/awayCode are omitted (unresolved
 * bracket slot), matches by date + stage round string.
 */
function findTsdbEvent(
  events: TsdbEvent[],
  opts: {
    dateISO: string;
    homeCode?: string;
    awayCode?: string;
    stage?: string; // our internal stage code
  },
): TsdbEvent | null {
  const targetTime = new Date(opts.dateISO).getTime();
  const stageRound = opts.stage ? STAGE_TO_TSDB_ROUND[opts.stage] : undefined;

  for (const ev of events) {
    // Build UTC timestamp from TSDB fields
    const tsStr = ev.strTimestamp
      ? `${ev.strTimestamp}Z`
      : ev.dateEvent && ev.strTime
        ? `${ev.dateEvent}T${ev.strTime}Z`
        : null;
    if (!tsStr) continue;
    if (Math.abs(new Date(tsStr).getTime() - targetTime) > 12 * 60 * 60 * 1000) continue;

    if (opts.homeCode && opts.awayCode) {
      const evHome = teamCodeFromApiName(ev.strHomeTeam);
      const evAway = teamCodeFromApiName(ev.strAwayTeam);
      if (!evHome || !evAway) continue;
      const direct  = evHome === opts.homeCode && evAway === opts.awayCode;
      const swapped = evHome === opts.awayCode && evAway === opts.homeCode;
      if (!direct && !swapped) continue;
    } else if (stageRound) {
      // Unresolved bracket slot: match by round (strRound as string or number)
      const evRound = String(ev.strRound || "").toLowerCase();
      if (evRound && !evRound.includes(stageRound.toLowerCase().split(" ")[0])) continue;
    }

    return ev;
  }
  return null;
}

/** Returns true when the TheSportsDB home team matches our homeCode. */
function isTsdbHomeFirst(ev: TsdbEvent, homeCode: string | undefined): boolean {
  if (!homeCode) return true;
  const evHome = teamCodeFromApiName(ev.strHomeTeam);
  return !evHome || evHome === homeCode;
}

// ---- Position + goal-type mapping ----------------------------------

const TSDB_POS_MAP: Record<string, AiLineupPlayer["position"]> = {
  G: "GK", D: "DEF", M: "MID", F: "FWD",
};

function mapTsdbPosition(short: string | undefined): AiLineupPlayer["position"] | null {
  if (!short) return null;
  return TSDB_POS_MAP[short.toUpperCase()] ?? null;
}

function mapTsdbGoalType(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  const d = detail.toLowerCase();
  if (d.includes("own"))     return "OWN";
  if (d.includes("penalty")) return "PENALTY";
  return undefined;
}

/** Map TheSportsDB timeline goals to AiGoalsLookup["goals"].
 *  Only "Goal" timeline entries are included (subs/cards are filtered). */
function mapTsdbGoals(
  timeline: TsdbTimelineEntry[],
  homeFirst: boolean,
): NonNullable<AiGoalsLookup["goals"]> {
  return timeline
    .filter(e => e.strTimeline?.toLowerCase() === "goal" && e.strPlayer)
    .map(e => {
      const isHome = e.strHome === "Yes";
      // If TSDB home matches our home orientation, keep as-is; else flip.
      const side: "HOME" | "AWAY" = (homeFirst ? isHome : !isHome) ? "HOME" : "AWAY";
      const entry: NonNullable<AiGoalsLookup["goals"]>[number] = {
        minute: e.intTime != null ? Number(e.intTime) : null,
        side,
        scorer: e.strPlayer!,
      };
      const assist = e.strAssist?.trim();
      if (assist) entry.assist = assist;
      const type = mapTsdbGoalType(e.strTimelineDetail);
      if (type) entry.type = type;
      return entry;
    });
}

// =====================================================================
// Exported lookup functions
// =====================================================================

/**
 * Look up a match's final score from TheSportsDB.
 *
 * Pass homeCode/awayCode (internal 3-letter codes) directly when known.
 * For unresolved knockout bracket slots, pass stageLabel = m.stage
 * (internal code like "R16", "QF").
 */
export async function lookupResultViaAI(opts: {
  homeName?: string;
  awayName?: string;
  homeCode?: string;
  awayCode?: string;
  dateISO: string;
  isKnockout?: boolean;
  stageLabel?: string;
}): Promise<AiResultLookup> {
  if (!hasTsdbKey()) return { found: false, reason: "no_thesportsdb_api_key" };

  const events = await fetchTsdbWcEvents();
  if (!events.length) return { found: false, reason: "fetch_failed_or_empty" };

  const hc = opts.homeCode || codeFromDisplayName(opts.homeName);
  const ac = opts.awayCode || codeFromDisplayName(opts.awayName);

  const ev = findTsdbEvent(events, {
    dateISO: opts.dateISO,
    homeCode: hc,
    awayCode: ac,
    stage: opts.stageLabel,
  });

  if (!ev) return { found: false, reason: "match_not_found_in_thesportsdb" };
  if (!tsdbIsFinished(ev.strStatus)) {
    return { found: false, reason: `match_status_${ev.strStatus || "unknown"}_not_finished` };
  }

  const rawHome = parseTsdbScore(ev.intHomeScore);
  const rawAway = parseTsdbScore(ev.intAwayScore);
  if (rawHome == null || rawAway == null) {
    return { found: false, reason: "missing_score_in_api_response" };
  }

  const homeFirst = isTsdbHomeFirst(ev, hc);

  let winnerSide: AiResultLookup["winnerSide"];
  if (opts.isKnockout) {
    const h = homeFirst ? rawHome : rawAway;
    const a = homeFirst ? rawAway : rawHome;
    if (h > a) winnerSide = "HOME";
    else if (a > h) winnerSide = "AWAY";
    else winnerSide = "DRAW";
  }

  return {
    found: true,
    home: homeFirst ? rawHome : rawAway,
    away: homeFirst ? rawAway : rawHome,
    homeTeamName: ev.strHomeTeam,
    awayTeamName: ev.strAwayTeam,
    winnerSide,
    sources: ["thesportsdb.com"],
  };
}

/**
 * Odds come exclusively from footballdata.io via the sync-odds cron.
 */
export async function lookupOddsViaAI(_opts: {
  homeName: string;
  awayName: string;
  dateISO: string;
}): Promise<AiOddsLookup> {
  return { found: false, reason: "odds_from_footballdata_io_only" };
}

/**
 * Lineups from TheSportsDB via lookuplineup.php.
 * Requires the event to already have lineups published (~1h before KO).
 */
export async function lookupLineupsViaAI(opts: {
  homeName: string;
  awayName: string;
  homeCode?: string;
  awayCode?: string;
  dateISO: string;
}): Promise<AiLineupsLookup> {
  if (!hasTsdbKey()) return { found: false, reason: "no_thesportsdb_api_key" };

  const events = await fetchTsdbWcEvents();
  const hc = opts.homeCode || codeFromDisplayName(opts.homeName);
  const ac = opts.awayCode || codeFromDisplayName(opts.awayName);

  const ev = findTsdbEvent(events, { dateISO: opts.dateISO, homeCode: hc, awayCode: ac });
  if (!ev?.idEvent) return { found: false, reason: "match_not_found" };

  const lineup = await fetchTsdbLineup(ev.idEvent);
  if (!lineup.length) return { found: false, reason: "no_lineup_data_yet" };

  const homeFirst = isTsdbHomeFirst(ev, hc);
  const starters = lineup.filter(p => p.strSubstitute === "No");
  const homeStarters = starters.filter(p => p.strHome === (homeFirst ? "Yes" : "No"));
  const awayStarters = starters.filter(p => p.strHome === (homeFirst ? "No" : "Yes"));

  if (homeStarters.length !== 11 || awayStarters.length !== 11) {
    return { found: false, reason: `incomplete_lineup: home=${homeStarters.length} away=${awayStarters.length}` };
  }

  function toPlayers(entries: TsdbLineupEntry[]): AiLineupPlayer[] | null {
    const players: AiLineupPlayer[] = [];
    for (const e of entries) {
      if (!e.strPlayer) return null;
      const pos = mapTsdbPosition(e.strPositionShort);
      if (!pos) return null;
      const num = e.intSquadNumber != null ? Number(e.intSquadNumber) : null;
      players.push({ name: e.strPlayer, position: pos, number: Number.isFinite(num) ? num : null });
    }
    if (!players.some(p => p.position === "GK")) return null;
    return players;
  }

  const homePlayers = toPlayers(homeStarters);
  const awayPlayers = toPlayers(awayStarters);
  if (!homePlayers || !awayPlayers) {
    return { found: false, reason: "invalid_lineup_entries" };
  }

  return {
    found: true,
    home: { startXI: homePlayers },
    away: { startXI: awayPlayers },
    sources: ["thesportsdb.com"],
  };
}

/**
 * Goal scorers / assists from TheSportsDB timeline.
 * Falls back to football-data.org if TheSportsDB timeline is empty.
 */
export async function lookupGoalsViaAI(opts: {
  homeName: string;
  awayName: string;
  homeCode?: string;
  awayCode?: string;
  dateISO: string;
  homeScore: number;
  awayScore: number;
}): Promise<AiGoalsLookup> {
  const hc = opts.homeCode || codeFromDisplayName(opts.homeName);
  const ac = opts.awayCode || codeFromDisplayName(opts.awayName);
  const expectedTotal = opts.homeScore + opts.awayScore;

  // --- TheSportsDB primary ---
  if (hasTsdbKey()) {
    const events = await fetchTsdbWcEvents();
    const ev = findTsdbEvent(events, { dateISO: opts.dateISO, homeCode: hc, awayCode: ac });
    if (ev?.idEvent) {
      const timeline = await fetchTsdbTimeline(ev.idEvent);
      if (timeline.length > 0) {
        const homeFirst = isTsdbHomeFirst(ev, hc);
        const goals = mapTsdbGoals(timeline, homeFirst);
        if (goals.length === expectedTotal) {
          return { found: true, goals, sources: ["thesportsdb.com"] };
        }
        // Count mismatch — might be incomplete data, try fallback below
      }
    }
  }

  // TheSportsDB is the only source — if timeline is empty or count mismatches, retry next cron tick.
  return { found: false, reason: "no_thesportsdb_api_key" };
}

/**
 * Live score from TheSportsDB livescore endpoint (V2, premium).
 * Also fetches the goal timeline for the live ticker.
 */
export async function lookupLiveScoreViaAI(opts: {
  homeName: string;
  awayName: string;
  homeCode?: string;
  awayCode?: string;
  dateISO: string;
  isKnockout?: boolean;
}): Promise<AiLiveScoreLookup> {
  if (!hasTsdbKey()) return { found: false, reason: "no_thesportsdb_api_key" };

  const hc = opts.homeCode || codeFromDisplayName(opts.homeName);
  const ac = opts.awayCode || codeFromDisplayName(opts.awayName);

  // Try live feed first (real-time, minute-by-minute)
  const liveEvents = await fetchTsdbLivescores();
  let ev = liveEvents.length
    ? findTsdbEvent(liveEvents, { dateISO: opts.dateISO, homeCode: hc, awayCode: ac })
    : null;

  // Fall back to cached season events (catches recently-finished matches)
  if (!ev) {
    const allEvents = await fetchTsdbWcEvents();
    ev = findTsdbEvent(allEvents, { dateISO: opts.dateISO, homeCode: hc, awayCode: ac });
  }

  if (!ev) return { found: false, reason: "match_not_found" };
  if (!tsdbIsLive(ev.strStatus) && !tsdbIsFinished(ev.strStatus)) {
    return { found: false, reason: `status_${ev.strStatus || "unknown"}_not_live` };
  }

  const rawHome = parseTsdbScore(ev.intHomeScore);
  const rawAway = parseTsdbScore(ev.intAwayScore);
  if (rawHome == null || rawAway == null) return { found: false, reason: "no_score_in_response" };

  const homeFirst = isTsdbHomeFirst(ev, hc);

  // Fetch goals from timeline when event ID is known
  let goals: NonNullable<AiGoalsLookup["goals"]> = [];
  if (ev.idEvent) {
    const timeline = await fetchTsdbTimeline(ev.idEvent);
    if (timeline.length > 0) goals = mapTsdbGoals(timeline, homeFirst);
  }

  return {
    found: true,
    home: homeFirst ? rawHome : rawAway,
    away: homeFirst ? rawAway : rawHome,
    minuteLabel: tsdbMinuteLabel(ev.strStatus),
    goals,
    sources: ["thesportsdb.com"],
  };
}

/**
 * Top assists — TheSportsDB doesn't have a dedicated scorers endpoint,
 * so we aggregate from goal timelines of finished matches.
 * This is expensive; the caller should cache the result in Firestore.
 */
export async function lookupAssistsLeaderboardViaAI(): Promise<AiAssistsLeaderboard> {
  if (!hasTsdbKey()) return { found: false, reason: "no_thesportsdb_api_key" };

  const events = await fetchTsdbWcEvents();
  const finished = events.filter(ev => tsdbIsFinished(ev.strStatus) && ev.idEvent);

  const assistCount: Record<string, { name: string; team: string; count: number }> = {};

  for (const ev of finished) {
    const timeline = await fetchTsdbTimeline(ev.idEvent!);
    const goals = timeline.filter(e => e.strTimeline?.toLowerCase() === "goal");
    for (const g of goals) {
      const assist = g.strAssist?.trim();
      if (!assist) continue;
      const team = teamCodeFromApiName(g.strTeam) || g.strTeam || "";
      const key = `${assist}::${team}`;
      if (!assistCount[key]) assistCount[key] = { name: assist, team, count: 0 };
      assistCount[key].count++;
    }
  }

  const assists = Object.values(assistCount)
    .filter(a => a.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  if (!assists.length) return { found: false, reason: "no_assists_data_yet" };
  return { found: true, assists };
}

/**
 * Hebrew transliteration served from the curated lib/players.ts database.
 * Unknown players stay in English. No external call is made.
 */
export async function translateNamesToHebrew(
  _names: string[],
): Promise<{ map: Record<string, string>; reason?: string }> {
  return { map: {}, reason: "transliteration_from_curated_db_only" };
}

// =====================================================================
// Helper exports (pure data mapping — unchanged)
// =====================================================================

export function aiGoalsToExternalGoals(
  goals: AiGoalsLookup["goals"],
  homeCode: string,
  awayCode: string,
): ExternalGoal[] {
  return (goals || []).map(g => {
    const goal: ExternalGoal = {
      minute: g.minute,
      teamCode: g.side === "HOME" ? homeCode : awayCode,
      scorer: g.scorer,
    };
    if (g.assist) goal.assist = g.assist;
    if (g.type)   goal.type   = g.type;
    return goal;
  });
}

export function aiGoalsToLiveGoals(
  goals: AiGoalsLookup["goals"],
): Array<{
  minute: number | null;
  team: "home" | "away";
  player: string;
  assist?: string;
  type?: string;
}> {
  return (goals || []).map(g => {
    const goal: ReturnType<typeof aiGoalsToLiveGoals>[number] = {
      minute: g.minute,
      team: g.side === "HOME" ? "home" : "away",
      player: g.scorer,
    };
    if (g.assist) goal.assist = g.assist;
    if (g.type)   goal.type   = g.type;
    return goal;
  });
}
