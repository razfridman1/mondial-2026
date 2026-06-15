/* =====================================================================
 * API-Football integration for real-time lineups.
 *
 * The MATCHES dataset is hand-built (Mondial 2026 schedule); the fetcher
 * resolves to the API-Football fixture by date + team codes when keys
 * are provided in env. Cached server-side in Firestore `live_lineups/{matchId}`.
 *
 * Set up:
 *   API_FOOTBALL_KEY   = <your-key>
 *   API_FOOTBALL_HOST  = v3.football.api-sports.io        (default)
 *
 * Sign up at https://dashboard.api-football.com/ — free tier = 100 req/day.
 * ===================================================================*/
import { getAdmin } from "./firebase-admin";
import type { TeamLineup, Formation } from "./lineups";
import { lineupFromAiXI } from "./lineups";
import type { Player, Position } from "./players";
import { TEAMS } from "./data";
import { lookupLineupsViaAI } from "./ai-result-fallback";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const AI_NEGATIVE_CACHE_MS = 10 * 60 * 1000; // 10 minutes between AI re-checks

/* API-Football team-id mapping (subset; extend in production) */
const AF_TEAM_IDS: Record<string, number> = {
  BRA: 6,   ARG: 26,  FRA: 2,   ENG: 10,  ESP: 9,
  GER: 25,  POR: 27,  NED: 1118,ITA: 768, MEX: 16,
  USA: 2384,CAN: 1330,
  // Add more as you go; missing entries fall back to default lineup.
};

interface ApiFootballPlayer {
  id: number;
  name: string;
  pos: string;             // "G" | "D" | "M" | "F"
  grid: string;            // "1:1" formation grid
  number?: number;
}

interface ApiFootballLineup {
  formation: string;       // e.g. "4-3-3"
  startXI: { player: ApiFootballPlayer }[];
}

const POS_MAP: Record<string, Position> = { G: "GK", D: "DEF", M: "MID", F: "FWD" };

function parseFormation(s: string | undefined): Formation {
  const allow: Formation[] = ["4-3-3","4-4-2","3-5-2","4-2-3-1","5-3-2"];
  return (allow.includes(s as Formation) ? s : "4-3-3") as Formation;
}

/* Read cached lineup or fetch from API-Football if cache stale */
export async function fetchLiveLineups(matchId: string, dateIso: string, homeCode: string, awayCode: string): Promise<{ home: TeamLineup; away: TeamLineup } | null> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return null;

  const { db } = getAdmin();
  const cacheRef = db.collection("live_lineups").doc(matchId);
  const cache = await cacheRef.get();
  const now = Date.now();
  if (cache.exists) {
    const data = cache.data() as any;
    if (data.cachedAt && now - data.cachedAt < CACHE_TTL_MS && data.home && data.away) {
      return { home: data.home, away: data.away };
    }
  }

  try {
    const host = process.env.API_FOOTBALL_HOST || "v3.football.api-sports.io";
    const homeId = AF_TEAM_IDS[homeCode];
    const awayId = AF_TEAM_IDS[awayCode];
    if (!homeId || !awayId) return null;

    /* 1. Find fixture id by date + team */
    const dateOnly = dateIso.slice(0, 10);
    const fxRes = await fetch(`https://${host}/fixtures?date=${dateOnly}&team=${homeId}`, {
      headers: { "x-apisports-key": apiKey },
    });
    if (!fxRes.ok) return null;
    const fxJson: any = await fxRes.json();
    const fx = (fxJson.response || []).find((f: any) =>
      f.teams?.home?.id === homeId && f.teams?.away?.id === awayId);
    if (!fx) return null;
    const fixtureId = fx.fixture?.id;

    /* 2. Fetch lineups */
    const lnRes = await fetch(`https://${host}/fixtures/lineups?fixture=${fixtureId}`, {
      headers: { "x-apisports-key": apiKey },
    });
    if (!lnRes.ok) return null;
    const lnJson: any = await lnRes.json();
    const arr: any[] = lnJson.response || [];
    const homeLn = arr.find(x => x.team?.id === homeId);
    const awayLn = arr.find(x => x.team?.id === awayId);
    if (!homeLn || !awayLn) return null;

    const home = toTeamLineup(homeCode, homeLn);
    const away = toTeamLineup(awayCode, awayLn);

    await cacheRef.set({ home, away, cachedAt: now, fixtureId });
    return { home, away };
  } catch (e) {
    return null;
  }
}

/* =====================================================================
 * AI fallback (no API_FOOTBALL_KEY needed) — used when fetchLiveLineups()
 * returns null. Asks Claude (web search) for the OFFICIAL published Starting
 * XI, same no-fabrication policy: found:false until lineups are actually
 * published (typically ~1h before kickoff).
 *
 * Only attempted in a window around kickoff (-2h .. +2.5h) — official
 * lineups simply don't exist outside that window, so we avoid burning AI
 * calls on long-shot lookups. Cached in the same live_lineups/{matchId} doc
 * as the API-Football path; a "not found yet" result is negative-cached for
 * AI_NEGATIVE_CACHE_MS so repeated page loads don't re-trigger AI on every
 * request while waiting for the official announcement.
 * ===================================================================*/
export async function fetchAiLineups(matchId: string, dateIso: string, homeCode: string, awayCode: string, opts?: { force?: boolean }): Promise<{ home: TeamLineup; away: TeamLineup } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const kickoff = new Date(dateIso).getTime();
  const now = Date.now();
  if (!opts?.force && (now < kickoff - 2 * 60 * 60 * 1000 || now > kickoff + 2.5 * 60 * 60 * 1000)) return null;

  const { db } = getAdmin();
  const cacheRef = db.collection("live_lineups").doc(matchId);
  const cache = await cacheRef.get();
  if (cache.exists) {
    const data = cache.data() as any;
    if (data.home && data.away) return { home: data.home, away: data.away };
    if (!opts?.force && data.aiCheckedAt && now - data.aiCheckedAt < AI_NEGATIVE_CACHE_MS) return null;
  }

  const home = TEAMS[homeCode], away = TEAMS[awayCode];
  if (!home || !away) return null;

  const lookup = await lookupLineupsViaAI({ homeName: home.nameEn, awayName: away.nameEn, dateISO: dateIso });
  if (!lookup.found || !lookup.home || !lookup.away) {
    await cacheRef.set({ aiCheckedAt: now, aiReason: lookup.reason || null }, { merge: true });
    return null;
  }

  const homeLineup = lineupFromAiXI(homeCode, lookup.home.formation, lookup.home.startXI);
  const awayLineup = lineupFromAiXI(awayCode, lookup.away.formation, lookup.away.startXI);
  await cacheRef.set({ home: homeLineup, away: awayLineup, cachedAt: now, source: "ai" }, { merge: true });
  return { home: homeLineup, away: awayLineup };
}

function toTeamLineup(teamCode: string, raw: any): TeamLineup {
  const formation = parseFormation(raw.formation);
  const startXI: any[] = raw.startXI || [];
  // Distribute players over our default formation grid (simplified)
  const slots = startXI.map((row: any, idx: number) => {
    const pp = row.player as ApiFootballPlayer;
    const [r, c] = (pp.grid || "1:1").split(":").map(Number);
    return {
      pos: POS_MAP[pp.pos] || "MID",
      x: ((c || 1) - 1) * 20 + 10,
      y: ((r || 1) - 1) * 18 + 8,
      role: pp.pos,
      player: {
        id: `${teamCode}-${pp.id}`,
        teamCode,
        name: pp.name,
        nameEn: pp.name,
        position: POS_MAP[pp.pos] || "MID",
        jersey: pp.number || (idx + 1),
        club: "—",
        age: 0,
      } as Player,
    };
  });
  return { teamCode, formation, slots };
}
