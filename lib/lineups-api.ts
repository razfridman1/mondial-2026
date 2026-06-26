/* =====================================================================
 * lineups-api.ts — fetch lineups via API-Football fixture lookup
 * Works for ALL 48 WC 2026 teams (no hardcoded team ID table).
 * Flow: Firestore cache (6h) → AF /fixtures?league=1 → AF /lineups
 *       → TheSportsDB fallback via lookupLineupsViaAI
 * ===================================================================*/
import { getAdmin } from "./firebase-admin";
import type { TeamLineup, Formation } from "./lineups";
import type { Player, Position } from "./players";
import { lookupLineupsViaAI } from "./ai-result-fallback";
import { fetchAfWcFixtures, fetchAfLineups } from "./api-football-wc";
import { teamCodeFromApiName as _tcfa } from "./team-name-mapper";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const POS_MAP: Record<string, Position> = { G: "GK", D: "DEF", M: "MID", F: "FWD" };

function parseFormation(s: string | undefined): Formation {
  const allow: Formation[] = ["4-3-3","4-4-2","3-5-2","4-2-3-1","5-3-2"];
  return (allow.includes(s as Formation) ? s : "4-3-3") as Formation;
}

function toTeamLineup(teamCode: string, raw: any): TeamLineup {
  const formation = parseFormation(raw.formation);
  const startXI: any[] = raw.startXI || [];
  const slots = startXI.map((row: any, idx: number) => {
    const pp = row.player;
    const [r, c] = (pp.grid || "1:1").split(":").map(Number);
    return {
      pos: POS_MAP[pp.pos] || "MID",
      x: ((c || 1) - 1) * 20 + 10,
      y: ((r || 1) - 1) * 18 + 8,
      role: pp.pos,
      player: {
        id: String(teamCode) + "-" + String(pp.id),
        teamCode,
        name: pp.name,
        nameEn: pp.name,
        position: POS_MAP[pp.pos] || "MID",
        jersey: pp.number || (idx + 1),
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
  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) return null;

  const { db } = getAdmin();
  const cacheRef = db.collection("live_lineups").doc(matchId);
  const now = Date.now();

  // --- Firestore cache ---
  try {
    const cache = await cacheRef.get();
    if (cache.exists) {
      const data = cache.data() as any;
      if (data.cachedAt && now - data.cachedAt < CACHE_TTL_MS && data.home && data.away) {
        return { home: data.home, away: data.away };
      }
    }
  } catch { /* cache miss */ }

  try {
    // --- Find fixture from full season list (covers all 48 teams) ---
    const allFixtures = await fetchAfWcFixtures();
    const targetMs = new Date(dateIso).getTime();

    const fixture = allFixtures.find(f => {
      const fixMs = new Date(f.fixture.date).getTime();
      if (Math.abs(fixMs - targetMs) > 12 * 60 * 60 * 1000) return false;
      const fh = _tcfa(f.teams.home.name);
      const fa = _tcfa(f.teams.away.name);
      return (fh === homeCode && fa === awayCode) || (fh === awayCode && fa === homeCode);
    });

    if (!fixture) return null;
    const fixtureId = fixture.fixture.id;

    // --- Fetch lineups for this fixture ---
    const rawLineups = await fetchAfLineups(fixtureId);
    if (!rawLineups || rawLineups.length < 2) return null;

    // Match lineup teams to our home/away codes
    const homeRaw = rawLineups.find(l => {
      const code = _tcfa(l.team.name);
      return code === homeCode;
    }) || rawLineups[0];
    const awayRaw = rawLineups.find(l => {
      const code = _tcfa(l.team.name);
      return code === awayCode;
    }) || rawLineups[1];

    if (!homeRaw.startXI?.length || !awayRaw.startXI?.length) return null;

    const home = toTeamLineup(homeCode, homeRaw);
    const away = toTeamLineup(awayCode, awayRaw);

    // Cache result
    await cacheRef.set({ home, away, cachedAt: now, fixtureId }).catch(() => {});
    return { home, away };
  } catch {
    return null;
  }
}

/* TheSportsDB fallback */
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
