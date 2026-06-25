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
 *
 * STRICT: only what the API returns.
 * No hardcoded bracket structure. No simulated progression.
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

        const rounds: BracketRound[] = [...roundMap.entries()]
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

      const rounds: BracketRound[] = [...roundMap.entries()]
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

    // No keys configured
    const empty: BracketData = { rounds: [], fetchedAt: now, total: 0, source: "none" };
    return NextResponse.json(empty);

  } catch (err) {
    console.error("[bracket] fetch error:", err);
    return NextResponse.json(
      { error: "Failed to load bracket data", rounds: [], fetchedAt: now, total: 0, source: "error" },
      { status: 500 }
    );
  }
}
