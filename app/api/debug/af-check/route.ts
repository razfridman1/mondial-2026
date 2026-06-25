import { NextResponse } from "next/server";
import { fetchAfWcFixtures, hasAfKey, AF_WC_LEAGUE, AF_WC_SEASON } from "@/lib/api-football-wc";
import { fetchTsdbWcEvents, hasTsdbKey } from "@/lib/thesportsdb";

/* ================================================================
 * GET /api/debug/af-check
 * Quick diagnostic — tests API-Football + TheSportsDB connectivity.
 * Remove or protect this route before going to production.
 * ================================================================ */

export async function GET() {
  const result: Record<string, any> = {
    env: {
      FOOTBALL_API_KEY: process.env.FOOTBALL_API_KEY ? "✅ set" : "❌ missing",
      FOOTBALL_API_URL: process.env.FOOTBALL_API_URL || "(default: https://v3.football.api-sports.io)",
      THESPORTSDB_API_KEY: process.env.THESPORTSDB_API_KEY ? "✅ set" : "❌ missing",
    },
  };

  // ---- API-Football check ----------------------------------------
  if (hasAfKey()) {
    try {
      const fixtures = await fetchAfWcFixtures();
      const finished = fixtures.filter(f =>
        ["FT","AET","PEN"].includes(f.fixture.status.short ?? "")
      );
      const live = fixtures.filter(f =>
        ["1H","HT","2H","ET","BT","P"].includes(f.fixture.status.short ?? "")
      );
      result["api-football"] = {
        status: "✅ connected",
        league: AF_WC_LEAGUE,
        season: AF_WC_SEASON,
        total_fixtures: fixtures.length,
        finished: finished.length,
        live: live.length,
        sample: fixtures.slice(0, 3).map(f => ({
          id: f.fixture.id,
          date: f.fixture.date,
          home: f.teams.home.name,
          away: f.teams.away.name,
          score: `${f.goals.home ?? "?"} - ${f.goals.away ?? "?"}`,
          status: f.fixture.status.short,
          round: f.league.round,
        })),
      };
    } catch (e: any) {
      result["api-football"] = { status: "❌ error", error: String(e?.message ?? e) };
    }
  } else {
    result["api-football"] = { status: "⚠️ no key — set FOOTBALL_API_KEY" };
  }

  // ---- TheSportsDB check -----------------------------------------
  if (hasTsdbKey()) {
    try {
      const events = await fetchTsdbWcEvents();
      result["thesportsdb"] = {
        status: "✅ connected",
        total_events: events.length,
        sample: events.slice(0, 3).map(e => ({
          id: e.idEvent,
          date: e.dateEvent,
          home: e.strHomeTeam,
          away: e.strAwayTeam,
          score: `${e.intHomeScore ?? "?"} - ${e.intAwayScore ?? "?"}`,
          status: e.strStatus,
          round: e.strRound,
        })),
      };
    } catch (e: any) {
      result["thesportsdb"] = { status: "❌ error", error: String(e?.message ?? e) };
    }
  } else {
    result["thesportsdb"] = { status: "⚠️ no key — set THESPORTSDB_API_KEY" };
  }

  return NextResponse.json(result, { status: 200 });
}
