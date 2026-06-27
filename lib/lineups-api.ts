/* =====================================================================
 * lineups-api.ts — fetch lineups via TheSportsDB (primary)
 * Env: THESPORTSDB_API_KEY
 * Flow: Firestore cache (6h) → TheSportsDB /lookuplineup → fallback AI
 * ===================================================================*/
import { getAdmin } from "./firebase-admin";
import type { TeamLineup, Formation } from "./lineups";
import type { Player, Position } from "./players";
import { lookupLineupsViaAI } from "./ai-result-fallback";
import {
  fetchTsdbWcEvents,
  fetchTsdbLineup,
  type TsdbLineupEntry,
} from "./thesportsdb";
import { teamCodeFromApiName as _tcfa } from "./team-name-mapper";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const POS_MAP: Record<string, Position> = { G: "GK", D: "DEF", M: "MID", F: "FWD" };
const ALLOW_FORMATIONS: Formation[] = ["4-3-3","4-4-2","3-5-2","4-2-3-1","5-3-2"];

function parseFormation(s: string | null | undefined): Formation {
  return (ALLOW_FORMATIONS.includes(s as Formation) ? s : "4-3-3") as Formation;
}

function buildTeamLineup(
  teamCode: string,
  starters: TsdbLineupEntry[],
): TeamLineup {
  const formation = parseFormation(starters[0]?.strFormation ?? null);
  const slots = starters.map((entry, idx) => {
    const posShort = (entry.strPositionShort || "M").toUpperCase();
    const pos = POS_MAP[posShort] || "MID";
    return {
      pos: pos as Position,
      x: (idx % 4) * 20 + 10,
      y: Math.floor(idx / 4) * 18 + 8,
      role: posShort,
      player: {
        id: `${teamCode}-tsdb-${idx}`,
        teamCode,
        name: entry.strPlayer || `שחקן ${idx + 1}`,
        nameEn: entry.strPlayer || "",
        position: pos as Position,
        jersey: Number(entry.intSquadNumber) || (idx + 1),
        club: "-",
        age: 0,
      } as Player,
    };
  });
  return { teamCode, formation, slots };
}

export async function fetchLiveLineups(
  matchId: string,
  dateIso: string,
  homeCode: string,
  awayCode: string,
): Promise<{ home: TeamLineup; away: TeamLineup } | null> {
  const { db } = getAdmin();
  const cacheRef = db.collection("live_lineups").doc(matchId);
  const now = Date.now();

  // --- Firestore cache ---
  try {
    const cache = await cacheRef.get();
    if (cache.exists) {
      const data = cache.data() as any;
      if (data.home && data.away && data.cachedAt && now - data.cachedAt < CACHE_TTL_MS) {
        return { home: data.home, away: data.away };
      }
    }
  } catch { /* cache miss */ }

  try {
    // --- Find event from season list ---
    const allEvents = await fetchTsdbWcEvents();
    const targetMs = new Date(dateIso).getTime();

    const event = allEvents.find(e => {
      const ts = e.strTimestamp ? e.strTimestamp + "Z" : `${e.dateEvent}T${e.strTime || "12:00:00"}Z`;
      const evMs = new Date(ts).getTime();
      if (Math.abs(evMs - targetMs) > 12 * 60 * 60 * 1000) return false;
      const fh = _tcfa(e.strHomeTeam || "");
      const fa = _tcfa(e.strAwayTeam || "");
      return (fh === homeCode && fa === awayCode) || (fh === awayCode && fa === homeCode);
    });

    if (!event?.idEvent) return null;

    // --- Fetch lineup entries ---
    const entries = await fetchTsdbLineup(event.idEvent);
    if (!entries.length) return null;

    // Starters only (strSubstitute === "No" or not "Yes")
    const starters = entries.filter(e => (e.strSubstitute || "No").toUpperCase() !== "YES");
    if (starters.length < 2) return null;

    // Split by home/away — strHome "Yes" = home team
    const homeStarters = starters.filter(e => e.strHome === "Yes");
    const awayStarters = starters.filter(e => e.strHome === "No");

    if (homeStarters.length < 5 || awayStarters.length < 5) return null;

    // If TheSportsDB home team is swapped vs our homeCode, swap back
    const tsdbHomeCode = _tcfa(homeStarters[0]?.strTeam || "");
    let home: TeamLineup;
    let away: TeamLineup;
    if (!tsdbHomeCode || tsdbHomeCode === homeCode) {
      home = buildTeamLineup(homeCode, homeStarters);
      away = buildTeamLineup(awayCode, awayStarters);
    } else {
      home = buildTeamLineup(homeCode, awayStarters);
      away = buildTeamLineup(awayCode, homeStarters);
    }

    // Cache result
    await cacheRef.set({ home, away, cachedAt: now, idEvent: event.idEvent }).catch(() => {});
    return { home, away };
  } catch {
    return null;
  }
}

/* TheSportsDB / AI fallback (used by /api/lineups route when primary fails) */
export async function fetchAiLineups(
  _matchId: string,
  dateIso: string,
  homeCode: string,
  awayCode: string,
  _opts?: { force?: boolean },
): Promise<{ home: TeamLineup; away: TeamLineup } | null> {
  const result = await lookupLineupsViaAI({
    homeName: homeCode, awayName: awayCode,
    homeCode, awayCode, dateISO: dateIso,
  });
  if (!result.found || !result.home || !result.away) return null;

  const posMap: Record<string, Position> = { GK: "GK", DEF: "DEF", MID: "MID", FWD: "FWD" };

  function fromTsdb(code: string, xi: NonNullable<typeof result.home>): TeamLineup {
    const slots = xi.startXI.map((p, idx) => ({
      pos: (posMap[p.position] ?? "MID") as Position,
      x: 10 + (idx % 4) * 20,
      y: 8 + Math.floor(idx / 4) * 18,
      role: p.position,
      player: {
        id: code + "-tsdb-" + idx,
        teamCode: code,
        name: p.name,
        nameEn: p.name,
        position: (posMap[p.position] ?? "MID") as Position,
        jersey: p.number ?? (idx + 1),
        club: "-",
        age: 0,
      } as Player,
    }));
    return { teamCode: code, formation: "4-3-3", slots };
  }

  return { home: fromTsdb(homeCode, result.home), away: fromTsdb(awayCode, result.away) };
}
