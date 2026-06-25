/* =====================================================================
 * ai-result-fallback.ts — data lookups for WC 2026.
 *
 * PRIMARY:  API-Football  (https://v3.football.api-sports.io)
 * FALLBACK: TheSportsDB   (https://www.thesportsdb.com/api)
 *
 * Set API_FOOTBALL_KEY (primary) and THESPORTSDB_API_KEY (fallback)
 * in your Vercel environment variables.
 *
 * All exported function names / interfaces are unchanged.
 * ===================================================================*/
import type { ExternalGoal } from "./football-data-api";
import { teamCodeFromApiName } from "./team-name-mapper";
import { TEAMS } from "./data";

// ---- API-Football (primary) ----------------------------------------
import {
  hasAfKey,
  fetchAfWcFixtures,
  fetchAfWcLivescores,
  fetchAfEvents,
  fetchAfLineups,
  findAfFixture,
  afIsHomeFirst,
  afIsFinished,
  afIsLive,
  afMinuteLabel,
  afFinalScore,
  afStatusNorm,
  type AfFixture,
  type AfEvent,
} from "./api-football-wc";

// ---- TheSportsDB (fallback) ----------------------------------------
import {
  hasTsdbKey,
  fetchTsdbWcEvents,
  fetchTsdbTimeline,
  fetchTsdbLineup,
  fetchTsdbLivescores,
  parseTsdbScore,
  tsdbIsFinished,
  tsdbIsLive,
  tsdbMinuteLabel,
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

// ---- Shared helpers -------------------------------------------------

function codeFromDisplayName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const mapped = teamCodeFromApiName(name);
  if (mapped) return mapped;
  for (const [code, t] of Object.entries(TEAMS)) {
    if (t.nameEn === name || t.name === name) return code;
  }
  return undefined;
}

// ---- TheSportsDB helpers (unchanged) --------------------------------

const STAGE_TO_TSDB_ROUND: Record<string, string> = {
  R32: "Round of 32", R16: "Round of 16",
  QF: "Quarter Final", SF: "Semi Final",
  THIRD: "3rd Place", FINAL: "Final",
};

function findTsdbEvent(
  events: TsdbEvent[],
  opts: { dateISO: string; homeCode?: string; awayCode?: string; stage?: string },
): TsdbEvent | null {
  const targetTime = new Date(opts.dateISO).getTime();
  const stageRound = opts.stage ? STAGE_TO_TSDB_ROUND[opts.stage] : undefined;
  for (const ev of events) {
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
      const evRound = String(ev.strRound || "").toLowerCase();
      if (evRound && !evRound.includes(stageRound.toLowerCase().split(" ")[0])) continue;
    }
    return ev;
  }
  return null;
}

function isTsdbHomeFirst(ev: TsdbEvent, homeCode: string | undefined): boolean {
  if (!homeCode) return true;
  const evHome = teamCodeFromApiName(ev.strHomeTeam);
  return !evHome || evHome === homeCode;
}

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
  if (d.includes("own")) return "OWN";
  if (d.includes("penalty")) return "PENALTY";
  return undefined;
}

function mapTsdbGoals(
  timeline: TsdbTimelineEntry[],
  homeFirst: boolean,
): NonNullable<AiGoalsLookup["goals"]> {
  return timeline
    .filter(e => e.strTimeline?.toLowerCase() === "goal" && e.strPlayer)
    .map(e => {
      const isHome = e.strHome === "Yes";
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

// ---- API-Football goal mapper ---------------------------------------

const AF_POS_MAP: Record<string, AiLineupPlayer["position"]> = {
  G: "GK", D: "DEF", M: "MID", F: "FWD",
};

function mapAfGoalType(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  const d = detail.toLowerCase();
  if (d.includes("own")) return "OWN";
  if (d.includes("penalty")) return "PENALTY";
  return undefined;
}

function mapAfGoals(
  events: AfEvent[],
  fix: AfFixture,
  homeCode: string | undefined,
): NonNullable<AiGoalsLookup["goals"]> {
  const homeFirst = afIsHomeFirst(fix, homeCode);
  return events
    .filter(e => e.type === "Goal")
    .map(e => {
      const isHome = teamCodeFromApiName(e.team.name) === teamCodeFromApiName(fix.teams.home.name);
      const side: "HOME" | "AWAY" = (homeFirst ? isHome : !isHome) ? "HOME" : "AWAY";
      const entry: NonNullable<AiGoalsLookup["goals"]>[number] = {
        minute: e.time.elapsed ?? null,
        side,
        scorer: e.player.name,
      };
      const assist = e.assist?.name?.trim();
      if (assist) entry.assist = assist;
      const type = mapAfGoalType(e.detail);
      if (type) entry.type = type;
      return entry;
    });
}

// =====================================================================
// Exported lookup functions
// =====================================================================

export async function lookupResultViaAI(opts: {
  homeName?: string;
  awayName?: string;
  homeCode?: string;
  awayCode?: string;
  dateISO: string;
  isKnockout?: boolean;
  stageLabel?: string;
}): Promise<AiResultLookup> {
  const hc = opts.homeCode || codeFromDisplayName(opts.homeName);
  const ac = opts.awayCode || codeFromDisplayName(opts.awayName);

  // ---- PRIMARY: API-Football ----------------------------------------
  if (hasAfKey()) {
    const fixtures = await fetchAfWcFixtures();
    const fix = findAfFixture(fixtures, { homeCode: hc, awayCode: ac, dateISO: opts.dateISO });
    if (fix && afIsFinished(fix.fixture.status.short)) {
      const score = afFinalScore(fix);
      if (score) {
        const homeFirst = afIsHomeFirst(fix, hc);
        const [h, a] = homeFirst ? [score.home, score.away] : [score.away, score.home];
        let winnerSide: AiResultLookup["winnerSide"];
        if (opts.isKnockout) {
          winnerSide = h > a ? "HOME" : a > h ? "AWAY" : "DRAW";
        }
        return {
          found: true,
          home: h,
          away: a,
          homeTeamName: fix.teams.home.name,
          awayTeamName: fix.teams.away.name,
          winnerSide,
          sources: ["api-football.com"],
        };
      }
    }
  }

  // ---- FALLBACK: TheSportsDB ----------------------------------------
  if (hasTsdbKey()) {
    const events = await fetchTsdbWcEvents();
    const ev = findTsdbEvent(events, { dateISO: opts.dateISO, homeCode: hc, awayCode: ac, stage: opts.stageLabel });
    if (ev && tsdbIsFinished(ev.strStatus)) {
      const rawHome = parseTsdbScore(ev.intHomeScore);
      const rawAway = parseTsdbScore(ev.intAwayScore);
      if (rawHome != null && rawAway != null) {
        const homeFirst = isTsdbHomeFirst(ev, hc);
        const [h, a] = homeFirst ? [rawHome, rawAway] : [rawAway, rawHome];
        let winnerSide: AiResultLookup["winnerSide"];
        if (opts.isKnockout) {
          winnerSide = h > a ? "HOME" : a > h ? "AWAY" : "DRAW";
        }
        return {
          found: true,
          home: h, away: a,
          homeTeamName: ev.strHomeTeam,
          awayTeamName: ev.strAwayTeam,
          winnerSide,
          sources: ["thesportsdb.com"],
        };
      }
    }
  }

  return { found: false, reason: "not_found_in_any_source" };
}

export async function lookupOddsViaAI(_opts: {
  homeName: string; awayName: string; dateISO: string;
}): Promise<AiOddsLookup> {
  return { found: false, reason: "odds_from_footballdata_io_only" };
}

export async function lookupLineupsViaAI(opts: {
  homeName: string;
  awayName: string;
  homeCode?: string;
  awayCode?: string;
  dateISO: string;
}): Promise<AiLineupsLookup> {
  const hc = opts.homeCode || codeFromDisplayName(opts.homeName);
  const ac = opts.awayCode || codeFromDisplayName(opts.awayName);

  // ---- PRIMARY: API-Football ----------------------------------------
  if (hasAfKey()) {
    const fixtures = await fetchAfWcFixtures();
    const fix = findAfFixture(fixtures, { homeCode: hc, awayCode: ac, dateISO: opts.dateISO });
    if (fix) {
      const lineups = await fetchAfLineups(fix.fixture.id);
      if (lineups.length === 2) {
        const homeFirst = afIsHomeFirst(fix, hc);
        const homeLn = lineups.find(l =>
          teamCodeFromApiName(l.team.name) === (homeFirst ? hc : ac)
        ) ?? lineups[0];
        const awayLn = lineups.find(l => l !== homeLn) ?? lineups[1];

        const toPlayers = (ln: typeof homeLn): AiLineupPlayer[] =>
          ln.startXI.map(row => ({
            name: row.player.name,
            position: (AF_POS_MAP[row.player.pos?.toUpperCase()] ?? "MID") as AiLineupPlayer["position"],
            number: row.player.number ?? null,
          }));

        const homePlayers = toPlayers(homeLn);
        const awayPlayers = toPlayers(awayLn);
        if (homePlayers.length === 11 && awayPlayers.length === 11) {
          return {
            found: true,
            home: { formation: homeLn.formation, startXI: homePlayers },
            away: { formation: awayLn.formation, startXI: awayPlayers },
            sources: ["api-football.com"],
          };
        }
      }
    }
  }

  // ---- FALLBACK: TheSportsDB ----------------------------------------
  if (hasTsdbKey()) {
    const events = await fetchTsdbWcEvents();
    const ev = findTsdbEvent(events, { dateISO: opts.dateISO, homeCode: hc, awayCode: ac });
    if (ev?.idEvent) {
      const lineup = await fetchTsdbLineup(ev.idEvent);
      if (lineup.length) {
        const homeFirst = isTsdbHomeFirst(ev, hc);
        const starters = lineup.filter(p => p.strSubstitute === "No");
        const homeStarters = starters.filter(p => p.strHome === (homeFirst ? "Yes" : "No"));
        const awayStarters = starters.filter(p => p.strHome === (homeFirst ? "No" : "Yes"));
        if (homeStarters.length === 11 && awayStarters.length === 11) {
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
          const hp = toPlayers(homeStarters);
          const ap = toPlayers(awayStarters);
          if (hp && ap) {
            return { found: true, home: { startXI: hp }, away: { startXI: ap }, sources: ["thesportsdb.com"] };
          }
        }
      }
    }
  }

  return { found: false, reason: "no_lineup_data_yet" };
}

export async function lookupGoalsViaAI(opts: {
  homeName: string; awayName: string;
  homeCode?: string; awayCode?: string;
  dateISO: string;
  homeScore: number; awayScore: number;
}): Promise<AiGoalsLookup> {
  const hc = opts.homeCode || codeFromDisplayName(opts.homeName);
  const ac = opts.awayCode || codeFromDisplayName(opts.awayName);
  const expectedTotal = opts.homeScore + opts.awayScore;

  // ---- PRIMARY: API-Football ----------------------------------------
  if (hasAfKey()) {
    const fixtures = await fetchAfWcFixtures();
    const fix = findAfFixture(fixtures, { homeCode: hc, awayCode: ac, dateISO: opts.dateISO });
    if (fix) {
      const events = await fetchAfEvents(fix.fixture.id);
      if (events.length > 0) {
        const goals = mapAfGoals(events, fix, hc);
        if (goals.length === expectedTotal) {
          return { found: true, goals, sources: ["api-football.com"] };
        }
        // count mismatch — try fallback
      }
    }
  }

  // ---- FALLBACK: TheSportsDB ----------------------------------------
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
      }
    }
  }

  return { found: false, reason: "goal_data_not_available_yet" };
}

export async function lookupLiveScoreViaAI(opts: {
  homeName: string; awayName: string;
  homeCode?: string; awayCode?: string;
  dateISO: string;
  isKnockout?: boolean;
}): Promise<AiLiveScoreLookup> {
  const hc = opts.homeCode || codeFromDisplayName(opts.homeName);
  const ac = opts.awayCode || codeFromDisplayName(opts.awayName);

  // ---- PRIMARY: API-Football ----------------------------------------
  if (hasAfKey()) {
    // Try live endpoint first
    let fix: AfFixture | null = null;
    const liveFixtures = await fetchAfWcLivescores();
    if (liveFixtures.length) {
      fix = findAfFixture(liveFixtures, { homeCode: hc, awayCode: ac, dateISO: opts.dateISO });
    }
    // Fall back to season fixtures (catches recent FT)
    if (!fix) {
      const allFixtures = await fetchAfWcFixtures();
      fix = findAfFixture(allFixtures, { homeCode: hc, awayCode: ac, dateISO: opts.dateISO });
    }
    if (fix && (afIsLive(fix.fixture.status.short) || afIsFinished(fix.fixture.status.short))) {
      const homeFirst = afIsHomeFirst(fix, hc);
      const gh = fix.goals.home ?? 0;
      const ga = fix.goals.away ?? 0;
      const events = fix.fixture.id ? await fetchAfEvents(fix.fixture.id) : [];
      const goals = mapAfGoals(events, fix, hc);
      return {
        found: true,
        home: homeFirst ? gh : ga,
        away: homeFirst ? ga : gh,
        minuteLabel: afMinuteLabel(fix),
        goals,
        sources: ["api-football.com"],
      };
    }
  }

  // ---- FALLBACK: TheSportsDB ----------------------------------------
  if (hasTsdbKey()) {
    const liveEvents = await fetchTsdbLivescores();
    let ev = liveEvents.length
      ? findTsdbEvent(liveEvents, { dateISO: opts.dateISO, homeCode: hc, awayCode: ac })
      : null;
    if (!ev) {
      const allEvents = await fetchTsdbWcEvents();
      ev = findTsdbEvent(allEvents, { dateISO: opts.dateISO, homeCode: hc, awayCode: ac });
    }
    if (ev && (tsdbIsLive(ev.strStatus) || tsdbIsFinished(ev.strStatus))) {
      const rawHome = parseTsdbScore(ev.intHomeScore);
      const rawAway = parseTsdbScore(ev.intAwayScore);
      if (rawHome != null && rawAway != null) {
        const homeFirst = isTsdbHomeFirst(ev, hc);
        let goals: NonNullable<AiGoalsLookup["goals"]> = [];
        if (ev.idEvent) {
          const timeline = await fetchTsdbTimeline(ev.idEvent);
          if (timeline.length) goals = mapTsdbGoals(timeline, homeFirst);
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
    }
  }

  return { found: false, reason: "not_live_or_not_found" };
}

export async function lookupAssistsLeaderboardViaAI(): Promise<AiAssistsLeaderboard> {
  const assistCount: Record<string, { name: string; team: string; count: number }> = {};

  // ---- PRIMARY: API-Football ----------------------------------------
  if (hasAfKey()) {
    const fixtures = await fetchAfWcFixtures();
    const finished = fixtures.filter(f => afIsFinished(f.fixture.status.short));
    for (const fix of finished) {
      const events = await fetchAfEvents(fix.fixture.id);
      for (const e of events) {
        if (e.type !== "Goal") continue;
        const assist = e.assist?.name?.trim();
        if (!assist) continue;
        const team = teamCodeFromApiName(e.team.name) || e.team.name;
        const key = `${assist}::${team}`;
        if (!assistCount[key]) assistCount[key] = { name: assist, team, count: 0 };
        assistCount[key].count++;
      }
    }
    if (Object.keys(assistCount).length > 0) {
      const assists = Object.values(assistCount)
        .filter(a => a.count > 0)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(a.name));
      return { found: true, assists };
    }
  }

  // ---- FALLBACK: TheSportsDB ----------------------------------------
  if (hasTsdbKey()) {
    const events = await fetchTsdbWcEvents();
    const finished = events.filter(ev => tsdbIsFinished(ev.strStatus) && ev.idEvent);
    for (const ev of finished) {
      const timeline = await fetchTsdbTimeline(ev.idEvent!);
      for (const g of timeline.filter(e => e.strTimeline?.toLowerCase() === "goal")) {
        const assist = g.strAssist?.trim();
        if (!assist) continue;
        const team = teamCodeFromApiName(g.strTeam) || g.strTeam || "";
        const key = `${assist}::${team}`;
        if (!assistCount[key]) assistCount[key] = { name: assist, team, count: 0 };
        assistCount[key].count++;
      }
    }
  }

  const assists = Object.values(assistCount)
    .filter(a => a.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (!assists.length) return { found: false, reason: "no_assists_data_yet" };
  return { found: true, assists };
}

export async function translateNamesToHebrew(
  _names: string[],
): Promise<{ map: Record<string, string>; reason?: string }> {
  return { map: {}, reason: "transliteration_from_curated_db_only" };
}

// =====================================================================
// Helper exports (unchanged)
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
