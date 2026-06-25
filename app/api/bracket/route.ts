import { NextResponse } from "next/server";
import { fetchTsdbWcEvents, parseTsdbScore } from "@/lib/thesportsdb";
import { teamCodeFromApiName } from "@/lib/team-name-mapper";

/* ================================================================
 * /api/bracket — server-side data layer for the knockout bracket.
 *
 * Fetches ALL WC 2026 events from TheSportsDB, filters to knockout
 * rounds only, groups by round, and returns structured JSON.
 *
 * STRICT: only what the API returns. No hardcoded bracket structure.
 * No simulated progression. No assumptions about winners.
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
}

// ---- Module-level cache (2 min) ----------------------------------

const CACHE_TTL = 2 * 60 * 1000;
let _cache: { data: BracketData; at: number } | null = null;

// ---- Knockout detection ------------------------------------------

/**
 * Returns true if this strRound value is a knockout stage.
 * Excludes: pure numbers (group matchdays), "Group X" strings,
 *           "Group Stage", null/undefined.
 * Includes: "Round of 32", "Round of 16", "Quarter-Final",
 *           "Semi-Final", "Final", "Third Place", "Play-off".
 */
function isKnockoutRound(round: string | number | undefined | null): boolean {
  if (round == null) return false;
  const r = String(round).trim().toLowerCase();
  if (!r) return false;
  // Pure number → group matchday
  if (/^\d+$/.test(r)) return false;
  // "Group A" .. "Group L" or "Group Stage"
  if (/^group\b/i.test(r)) return false;
  // Known knockout keywords
  return /round of|quarter|semi|final|third|3rd place|play.?off/i.test(r);
}

// ---- Round metadata ----------------------------------------------

function roundOrder(round: string): number {
  const r = round.toLowerCase();
  if (/round of 32|last 32/i.test(r)) return 1;
  if (/round of 16|last 16/i.test(r)) return 2;
  if (/quarter/i.test(r)) return 3;
  if (/semi/i.test(r)) return 4;
  if (/third|3rd/i.test(r)) return 5;
  if (/\bfinal\b/i.test(r)) return 6;
  return 99;
}

function roundTitle(round: string): string {
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
    const events = await fetchTsdbWcEvents();

    // Filter to knockout rounds only
    const koEvents = events.filter(e => isKnockoutRound(e.strRound));

    // Group by round name
    const roundMap = new Map<string, typeof koEvents>();
    for (const e of koEvents) {
      const rName = String(e.strRound ?? "").trim();
      if (!roundMap.has(rName)) roundMap.set(rName, []);
      roundMap.get(rName)!.push(e);
    }

    // Build rounds array
    const rounds: BracketRound[] = [...roundMap.entries()]
      .map(([name, matches]) => ({
        name,
        title: roundTitle(name),
        order: roundOrder(name),
        matches: matches
          .sort((a, b) => {
            const ta = a.strTimestamp || (a.dateEvent && a.strTime ? `${a.dateEvent}T${a.strTime}` : a.dateEvent) || "";
            const tb = b.strTimestamp || (b.dateEvent && b.strTime ? `${b.dateEvent}T${b.strTime}` : b.dateEvent) || "";
            return ta.localeCompare(tb);
          })
          .map(e => {
            const raw = e as any;
            return {
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
            } as BracketMatch;
          }),
      }))
      .filter(r => r.matches.length > 0)
      .sort((a, b) => a.order - b.order);

    const data: BracketData = { rounds, fetchedAt: now, total: koEvents.length };
    _cache = { data, at: now };

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=60" },
    });
  } catch (err) {
    console.error("[bracket] fetch error:", err);
    return NextResponse.json(
      { error: "Failed to load bracket data", rounds: [], fetchedAt: now, total: 0 },
      { status: 500 }
    );
  }
}
