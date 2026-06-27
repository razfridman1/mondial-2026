import { NextResponse } from "next/server";
import {
  hasAfKey,
  fetchAfWcFixtures,
  afIsKnockoutRound,
  afRoundOrder,
  afRoundTitle,
  afIsFinished,
  afIsLive,
  afFinalScore,
  type AfFixture,
} from "@/lib/api-football-wc";
import { teamCodeFromApiName } from "@/lib/team-name-mapper";
import {
  hasTsdbKey,
  fetchTsdbWcEvents,
  parseTsdbScore,
} from "@/lib/thesportsdb";

/* ================================================================
 * /api/bracket — server-side data layer for the knockout bracket.
 *
 * PRIMARY:  API-Football (v3.football.api-sports.io)
 * FALLBACK: TheSportsDB
 * STATIC:   Known R32 fixtures (injected when APIs lack R32 data)
 *
 * STRICT: only what the API returns — or known static fixtures.
 * ================================================================ */

// ---- Types -------------------------------------------------------

export interface BracketMatch {
  idEvent: string;
  homeTeam: string | null;
  awayTeam: string | null;
  homeCode: string | null;
  awayCode: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  timestamp: string | null;
  venue: string | null;
  city: string | null;
  source: string;
}

export interface BracketRound {
  name: string;
  title: string;
  order: number;
  matches: BracketMatch[];
}

export interface BracketData {
  rounds: BracketRound[];
  fetchedAt: number;
  total: number;
  source: string;
}

// ---- Module-level cache (2 min) ----------------------------------

const CACHE_TTL = 2 * 60 * 1000;
let _cache: { data: BracketData; at: number } | null = null;

// ---- Static R32 fixtures (known as of 27 June 2026) -------------

const STATIC_R32: BracketMatch[] = [
  { idEvent: "sr32-1",  homeTeam: "דרום אפריקה", homeCode: "RSA", awayTeam: "קנדה",        awayCode: "CAN", homeScore: null, awayScore: null, status: "NS", timestamp: "2026-06-28T19:00:00Z", venue: "SoFi Stadium",          city: "Inglewood",   source: "static" },
  { idEvent: "sr32-2",  homeTeam: "גרמניה",       homeCode: "GER", awayTeam: "פרגוואי",     awayCode: "PAR", homeScore: null, awayScore: null, status: "NS", timestamp: "2026-06-29T17:00:00Z", venue: "Gillette Stadium",      city: "Foxboro",     source: "static" },
  { idEvent: "sr32-3",  homeTeam: "ברזיל",        homeCode: "BRA", awayTeam: "יפן",          awayCode: "JPN", homeScore: null, awayScore: null, status: "NS", timestamp: "2026-06-29T20:30:00Z", venue: "NRG Stadium",           city: "Houston",     source: "static" },
  { idEvent: "sr32-4",  homeTeam: "הולנד",        homeCode: "NED", awayTeam: "מרוקו",        awayCode: "MAR", homeScore: null, awayScore: null, status: "NS", timestamp: "2026-06-30T01:00:00Z", venue: "Estadio BBVA",          city: "Monterrey",   source: "static" },
  { idEvent: "sr32-5",  homeTeam: "חוף השנהב",    homeCode: "CIV", awayTeam: "נורווגיה",     awayCode: "NOR", homeScore: null, awayScore: null, status: "NS", timestamp: "2026-06-30T17:00:00Z", venue: "AT&T Stadium",          city: "Arlington",   source: "static" },
  { idEvent: "sr32-6",  homeTeam: "צרפת",         homeCode: "FRA", awayTeam: "שוודיה",       awayCode: "SWE", homeScore: null, awayScore: null, status: "NS", timestamp: "2026-06-30T21:00:00Z", venue: "MetLife Stadium",       city: "New Jersey",  source: "static" },
  { idEvent: "sr32-7",  homeTeam: "מקסיקו",       homeCode: "MEX", awayTeam: "אקוודור",      awayCode: "ECU", homeScore: null, awayScore: null, status: "NS", timestamp: "2026-07-01T01:00:00Z", venue: "Estadio Azteca",        city: "Mexico City", source: "static" },
  { idEvent: "sr32-8",  homeTeam: "אנגליה",        homeCode: "ENG", awayTeam: "סנגל",         awayCode: "SEN", homeScore: null, awayScore: null, status: "NS", timestamp: "2026-07-01T16:00:00Z", venue: "Mercedes-Benz Stadium", city: "Atlanta",     source: "static" },
  { idEvent: "sr32-9",  homeTeam: "מצרים",         homeCode: "EGY", awayTeam: "דרום קוריאה",  awayCode: "KOR", homeScore: null, awayScore: null, status: "NS", timestamp: "2026-07-01T20:00:00Z", venue: "Lumen Field",           city: "Seattle",     source: "static" },
  { idEvent: "sr32-10", homeTeam: "ארה\"ב", homeCode: "USA", awayTeam: "בוסניה",      awayCode: "BIH", homeScore: null, awayScore: null, status: "NS", timestamp: "2026-07-02T00:00:00Z", venue: "Levi's Stadium",        city: "Santa Clara", source: "static" },
  { idEvent: "sr32-11", homeTeam: "ספרד",          homeCode: "ESP", awayTeam: "אוסטריה",      awayCode: "AUT", homeScore: null, awayScore: null, status: "NS", timestamp: "2026-07-02T19:00:00Z", venue: "SoFi Stadium",          city: "Inglewood",   source: "static" },
  { idEvent: "sr32-12", homeTeam: "פורטוגל",       homeCode: "POR", awayTeam: "גאנה",         awayCode: "GHA", homeScore: null, awayScore: null, status: "NS", timestamp: "2026-07-02T23:00:00Z", venue: "BMO Field",             city: "Toronto",     source: "static" },
  { idEvent: "sr32-13", homeTeam: "שווייץ",        homeCode: "SUI", awayTeam: "אלג'יריה",    awayCode: "ALG", homeScore: null, awayScore: null, status: "NS", timestamp: "2026-07-03T03:00:00Z", venue: "BC Place",              city: "Vancouver",   source: "static" },
  { idEvent: "sr32-14", homeTeam: "אוסטרליה",      homeCode: "AUS", awayTeam: "איראן",        awayCode: "IRN", homeScore: null, awayScore: null, status: "NS", timestamp: "2026-07-03T18:00:00Z", venue: "AT&T Stadium",          city: "Arlington",   source: "static" },
  { idEvent: "sr32-15", homeTeam: "ארגנטינה",      homeCode: "ARG", awayTeam: "כף ורדה",      awayCode: "CPV", homeScore: null, awayScore: null, status: "NS", timestamp: "2026-07-03T22:00:00Z", venue: "Hard Rock Stadium",     city: "Miami",       source: "static" },
  { idEvent: "sr32-16", homeTeam: "קולומביה",       homeCode: "COL", awayTeam: "קרואטיה",      awayCode: "CRO", homeScore: null, awayScore: null, status: "NS", timestamp: "2026-07-04T01:30:00Z", venue: "Arrowhead Stadium",     city: "Kansas City", source: "static" },
];

const STATIC_R32_ROUND: BracketRound = {
  name: "Round of 32",
  title: "שלב 32 האחרונות",
  order: 1,
  matches: STATIC_R32.sort((a, b) =>
    (a.timestamp || "").localeCompare(b.timestamp || "")
  ),
};

/** Inject static R32 into rounds if API didn't return any R32 data. */
function ensureR32(rounds: BracketRound[]): BracketRound[] {
  const hasR32 = rounds.some(r =>
    /round.of.32|last.32|r32/i.test(r.name) && r.matches.length > 0
  );
  if (hasR32) return rounds;
  return [STATIC_R32_ROUND, ...rounds];
}

// ---- TheSportsDB knockout helpers --------------------------------

function tsdbIsKnockoutRound(round: string | number | undefined | null): boolean {
  if (round == null) return false;
  const r = String(round).trim().toLowerCase();
  if (!r || /^\d+$/.test(r) || /^group\b/i.test(r) || /group stage/i.test(r)) return false;
  return /round of|quarter|semi|final|third|3rd place|play.?off/i.test(r);
}

function tsdbRoundOrder(round: string): number {
  const r = round.toLowerCase();
  if (/round of 32/i.test(r)) return 1;
  if (/round of 16/i.test(r)) return 2;
  if (/quarter/i.test(r)) return 3;
  if (/semi/i.test(r)) return 4;
  if (/third|3rd/i.test(r)) return 5;
  if (/\bfinal\b/i.test(r)) return 6;
  return 99;
}

function tsdbRoundTitle(round: string): string {
  const r = round.toLowerCase();
  if (/round of 32/i.test(r)) return "שלב 32 האחרונות";
  if (/round of 16/i.test(r)) return "שמינית גמר";
  if (/quarter/i.test(r)) return "רבע גמר";
  if (/semi/i.test(r)) return "חצי גמר";
  if (/third|3rd/i.test(r)) return "מקום שלישי";
  if (/\bfinal\b/i.test(r)) return "הגמר";
  return round;
}

// ---- Route handler -----------------------------------------------

export async function GET() {
  const now = Date.now();

  if (_cache && now - _cache.at < CACHE_TTL) {
    return NextResponse.json(_cache.data, {
      headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=60" },
    });
  }

  try {
    // ---- PRIMARY: API-Football -----------------------------------
    if (hasAfKey()) {
      const fixtures = await fetchAfWcFixtures();
      const koFixtures = fixtures.filter(f => afIsKnockoutRound(f.league.round));

      if (koFixtures.length > 0) {
        const roundMap = new Map<string, BracketMatch[]>();

        for (const f of koFixtures) {
          const round = f.league.round;
          if (!roundMap.has(round)) roundMap.set(round, []);

          const status = f.fixture.status.short;
          const score = afFinalScore(f);
          const rawHome = f.goals.home;
          const rawAway = f.goals.away;

          roundMap.get(round)!.push({
            idEvent: String(f.fixture.id),
            homeTeam: f.teams.home.name || null,
            awayTeam: f.teams.away.name || null,
            homeCode: teamCodeFromApiName(f.teams.home.name) || null,
            awayCode: teamCodeFromApiName(f.teams.away.name) || null,
            homeScore: rawHome ?? null,
            awayScore: rawAway ?? null,
            status: status || "NS",
            timestamp: f.fixture.date || null,
            venue: f.fixture.venue?.name || null,
            city: f.fixture.venue?.city || null,
            source: "api-football.com",
          });
        }

        let rounds: BracketRound[] = [...roundMap.entries()]
          .map(([name, matches]) => ({
            name,
            title: afRoundTitle(name),
            order: afRoundOrder(name),
            matches: matches.sort((a, b) =>
              (a.timestamp || "").localeCompare(b.timestamp || "")
            ),
          }))
          .filter(r => r.matches.length > 0)
          .sort((a, b) => a.order - b.order);

        rounds = ensureR32(rounds);

        const data: BracketData = {
          rounds,
          fetchedAt: now,
          total: koFixtures.length,
          source: "api-football.com",
        };
        _cache = { data, at: now };
        return NextResponse.json(data, {
          headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=60" },
        });
      }
    }

    // ---- FALLBACK: TheSportsDB -----------------------------------
    if (hasTsdbKey()) {
      const events = await fetchTsdbWcEvents();
      const koEvents = events.filter(e => tsdbIsKnockoutRound(e.strRound));

      const roundMap = new Map<string, BracketMatch[]>();
      for (const e of koEvents) {
        const rName = String(e.strRound ?? "").trim();
        if (!roundMap.has(rName)) roundMap.set(rName, []);
        const raw = e as any;
        roundMap.get(rName)!.push({
          idEvent: e.idEvent,
          homeTeam: e.strHomeTeam || null,
          awayTeam: e.strAwayTeam || null,
          homeCode: teamCodeFromApiName(e.strHomeTeam) || null,
          awayCode: teamCodeFromApiName(e.strAwayTeam) || null,
          homeScore: parseTsdbScore(e.intHomeScore),
          awayScore: parseTsdbScore(e.intAwayScore),
          status: e.strStatus || "NS",
          timestamp: e.strTimestamp
            || (e.dateEvent && e.strTime ? `${e.dateEvent}T${e.strTime}` : null)
            || e.dateEvent
            || null,
          venue: raw.strVenue || raw.strStadium || null,
          city: raw.strCity || raw.strCountry || null,
          source: "thesportsdb.com",
        });
      }

      let rounds: BracketRound[] = [...roundMap.entries()]
        .map(([name, matches]) => ({
          name,
          title: tsdbRoundTitle(name),
          order: tsdbRoundOrder(name),
          matches: matches.sort((a, b) =>
            (a.timestamp || "").localeCompare(b.timestamp || "")
          ),
        }))
        .filter(r => r.matches.length > 0)
        .sort((a, b) => a.order - b.order);

      rounds = ensureR32(rounds);

      const data: BracketData = {
        rounds,
        fetchedAt: now,
        total: koEvents.length,
        source: "thesportsdb.com",
      };
      _cache = { data, at: now };
      return NextResponse.json(data, {
        headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=60" },
      });
    }

    // No keys configured — still serve static R32
    const data: BracketData = {
      rounds: [STATIC_R32_ROUND],
      fetchedAt: now,
      total: STATIC_R32.length,
      source: "static",
    };
    _cache = { data, at: now };
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=60" },
    });

  } catch (err) {
    console.error("[bracket] fetch error:", err);
    // On error, return static R32 so the bracket still shows something useful
    const data: BracketData = {
      rounds: [STATIC_R32_ROUND],
      fetchedAt: now,
      total: STATIC_R32.length,
      source: "static",
    };
    return NextResponse.json(data, { status: 200 });
  }
}
