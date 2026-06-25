import { NextResponse } from "next/server";
import { MATCHES } from "@/lib/data";
import { teamCodeFromApiName } from "@/lib/team-name-mapper";
import {
  hasAfKey,
  fetchAfWcLivescores,
  fetchAfWcFixtures,
  fetchAfEvents,
  afIsLive,
  afIsFinished,
  afMinuteLabel,
  afStatusNorm,
  type AfFixture,
} from "@/lib/api-football-wc";
import {
  hasTsdbKey,
  fetchTsdbLivescores,
  fetchTsdbWcEvents,
  fetchTsdbTimeline,
  parseTsdbScore,
  tsdbIsLive,
  tsdbIsFinished,
  tsdbMinuteLabel,
} from "@/lib/thesportsdb";

/* ================================================================
 * GET /api/live-now
 *
 * Dedicated real-time live score endpoint. Polls BOTH sources:
 *   PRIMARY:  API-Football  (/fixtures?live=all&league=1)
 *   FALLBACK: TheSportsDB   (/livescore/{leagueId})
 *
 * Short server cache: 25 seconds.
 * Maps API fixtures to our internal MATCHES IDs by teams + date.
 * Returns current score, minute, goals for every live match.
 * ================================================================ */

// Force dynamic rendering — never cache at the Next.js/CDN layer.
// This endpoint fetches live scores and must always return fresh data.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export type { LiveNowMatch, LiveNowResponse } from "@/lib/live-now-types";
import type { LiveNowMatch, LiveNowResponse } from "@/lib/live-now-types";

// ---- Internal match finder ---------------------------------------
/** Find internal match ID for a given home/away code + date. */
function findInternalMatchId(
  homeCode: string | null,
  awayCode: string | null,
  dateISO: string,
): string | null {
  if (!homeCode || !awayCode) return null;
  const targetMs = new Date(dateISO).getTime();
  for (const m of MATCHES) {
    const matchMs = new Date(m.utc).getTime();
    if (Math.abs(matchMs - targetMs) > 12 * 60 * 60 * 1000) continue;
    const direct  = m.home === homeCode && m.away === awayCode;
    const swapped = m.home === awayCode && m.away === homeCode;
    if (direct || swapped) return m.id;
  }
  return null;
}

// ---- Route -------------------------------------------------------
export async function GET() {
  const now = Date.now();
  const sources: string[] = [];
  const matchMap = new Map<string, LiveNowMatch>(); // matchId → data

  // ---- PRIMARY: API-Football live endpoint -----------------------
  if (hasAfKey()) {
    try {
      // 1. Try the dedicated live endpoint first
      let liveFixtures: AfFixture[] = await fetchAfWcLivescores();

      // 2. If nothing live, fall back to full season (catches HT or very
      //    recently finished matches that dropped off the live feed)
      if (liveFixtures.length === 0) {
        const all = await fetchAfWcFixtures();
        liveFixtures = all.filter(f =>
          afIsLive(f.fixture.status.short) || afIsFinished(f.fixture.status.short)
        );
      }

      if (liveFixtures.length > 0) sources.push("api-football.com");

      for (const fix of liveFixtures) {
        const hCode = teamCodeFromApiName(fix.teams.home.name);
        const aCode = teamCodeFromApiName(fix.teams.away.name);
        const matchId = findInternalMatchId(hCode, aCode, fix.fixture.date);

        // Fetch goal events
        let goals: LiveNowMatch["goals"] = [];
        try {
          const events = await fetchAfEvents(fix.fixture.id);
          const homeCode = hCode;
          for (const ev of events) {
            if (ev.type !== "Goal") continue;
            const scorerTeamCode = teamCodeFromApiName(ev.team.name);
            const isHome = scorerTeamCode === hCode;
            const g: LiveNowMatch["goals"][number] = {
              minute: ev.time.elapsed ?? null,
              team: isHome ? "home" : "away",
              player: ev.player.name,
            };
            if (ev.assist?.name) g.assist = ev.assist.name;
            const d = ev.detail?.toLowerCase();
            if (d?.includes("own")) g.type = "OWN";
            else if (d?.includes("penalty")) g.type = "PENALTY";
            goals.push(g);
          }
        } catch { /* goals unavailable — proceed with score only */ }

        const entry: LiveNowMatch = {
          matchId: matchId ?? `af-${fix.fixture.id}`,
          homeCode: hCode ?? fix.teams.home.name,
          awayCode: aCode ?? fix.teams.away.name,
          homeScore: fix.goals.home ?? 0,
          awayScore: fix.goals.away ?? 0,
          status: afStatusNorm(fix.fixture.status.short),
          minuteLabel: afMinuteLabel(fix),
          elapsed: fix.fixture.status.elapsed ?? null,
          goals,
          source: "api-football.com",
        };

        if (matchId) matchMap.set(matchId, entry);
        else matchMap.set(`af-${fix.fixture.id}`, entry);
      }
    } catch (e) {
      console.error("[live-now] af error:", e);
    }
  }

  // ---- FALLBACK / SUPPLEMENT: TheSportsDB live -------------------
  if (hasTsdbKey()) {
    try {
      let liveEvents = await fetchTsdbLivescores();
      if (liveEvents.length === 0) {
        const all = await fetchTsdbWcEvents();
        liveEvents = all.filter(e => tsdbIsLive(e.strStatus) || tsdbIsFinished(e.strStatus));
      }

      if (liveEvents.length > 0 && !sources.includes("thesportsdb.com")) {
        sources.push("thesportsdb.com");
      }

      for (const ev of liveEvents) {
        const hCode = teamCodeFromApiName(ev.strHomeTeam);
        const aCode = teamCodeFromApiName(ev.strAwayTeam);
        const dateISO = ev.strTimestamp
          ? `${ev.strTimestamp}Z`
          : ev.dateEvent && ev.strTime
            ? `${ev.dateEvent}T${ev.strTime}Z`
            : ev.dateEvent ?? "";
        const matchId = findInternalMatchId(hCode, aCode, dateISO);
        const key = matchId ?? `tsdb-${ev.idEvent}`;

        // Only use TSDB if AF didn't already provide this match
        if (matchId && matchMap.has(matchId)) continue;

        // Fetch goals from timeline
        let goals: LiveNowMatch["goals"] = [];
        if (ev.idEvent) {
          try {
            const timeline = await fetchTsdbTimeline(ev.idEvent);
            for (const t of timeline) {
              if (t.strTimeline?.toLowerCase() !== "goal" || !t.strPlayer) continue;
              const isHome = t.strHome === "Yes";
              const g: LiveNowMatch["goals"][number] = {
                minute: t.intTime != null ? Number(t.intTime) : null,
                team: isHome ? "home" : "away",
                player: t.strPlayer,
              };
              if (t.strAssist?.trim()) g.assist = t.strAssist.trim();
              const d = t.strTimelineDetail?.toLowerCase();
              if (d?.includes("own")) g.type = "OWN";
              else if (d?.includes("penalty")) g.type = "PENALTY";
              goals.push(g);
            }
          } catch { /* skip */ }
        }

        const home = parseTsdbScore(ev.intHomeScore) ?? 0;
        const away = parseTsdbScore(ev.intAwayScore) ?? 0;
        const entry: LiveNowMatch = {
          matchId: key,
          homeCode: hCode ?? ev.strHomeTeam ?? "",
          awayCode: aCode ?? ev.strAwayTeam ?? "",
          homeScore: home,
          awayScore: away,
          status: ev.strStatus ?? "NS",
          minuteLabel: tsdbMinuteLabel(ev.strStatus),
          elapsed: null,
          goals,
          source: "thesportsdb.com",
        };
        matchMap.set(key, entry);
      }
    } catch (e) {
      console.error("[live-now] tsdb error:", e);
    }
  }

  const data: LiveNowResponse = {
    matches: Array.from(matchMap.values()),
    fetchedAt: now,
    sources,
  };
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
  });
}
