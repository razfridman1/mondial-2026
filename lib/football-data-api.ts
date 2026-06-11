/* =====================================================================
 * football-data.org — live World Cup 2026 squads & coaches.
 * Server-only (uses FOOTBALL_API_KEY, already configured for results sync).
 *
 * football-data.org's `/v4/competitions/WC/teams` returns the OFFICIAL
 * 26-man roster + coach for all 48 teams in a single authenticated call.
 * We map each entry to our internal team codes via teamCodeFromApiName
 * and to our Player/Coach shapes. Fields the API doesn't provide (jersey
 * number, club, captain) are left undefined — NEVER fabricated, per the
 * app's no-fake-data policy. Players from this source are flagged
 * `live: true` so the UI can show an "live data" badge.
 * ===================================================================*/
import { teamCodeFromApiName } from "./team-name-mapper";
import { TEAMS } from "./data";
import type { Player, Coach, Position } from "./players";

const POSITION_MAP: Record<string, Position> = {
  Goalkeeper: "GK",
  Defence: "DEF",
  Midfield: "MID",
  Offence: "FWD",
  Attack: "FWD",
};

/* Age as of the tournament's opening match (2026-06-11), computed from
 * the player's date of birth — never guessed. */
function ageFromDob(dob: string | undefined | null): number | undefined {
  if (!dob) return undefined;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return undefined;
  const ref = new Date("2026-06-11T00:00:00Z");
  let age = ref.getUTCFullYear() - d.getUTCFullYear();
  const m = ref.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && ref.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

/* Best-effort flag emoji for a coach's nationality, via our TEAMS table.
 * Falls back to a generic globe rather than guessing a flag. */
function flagForNationality(nationality: string | undefined | null): string {
  const code = teamCodeFromApiName(nationality);
  return (code && TEAMS[code]?.flag) || "🌍";
}

export type LiveSquads = Record<string, Player[]>;
export type LiveCoaches = Record<string, Coach>;

/* ---------------------------------------------------------------------
 * Per-player enrichment — jersey number & current club.
 *
 * The bulk `/competitions/WC/teams` endpoint above does NOT include
 * `shirtNumber` or `currentTeam` for squad members. football-data.org's
 * `/persons/{id}` endpoint DOES provide both, but it's one call per
 * player — with the free tier's 10 req/min limit, all ~1,200 WC players
 * must be enriched gradually via a dedicated cron
 * (see /api/cron/sync-player-details), cached in Firestore, and merged
 * into the live squads by /api/squads.
 * ------------------------------------------------------------------- */
export interface PersonDetails {
  shirtNumber?: number;
  club?: string;
}

/** Fetch a single player's shirt number + current club from
 * football-data.org's /persons/{id} endpoint. Returns null on any
 * failure (missing key, network error, bad response, not found). */
export async function fetchPersonDetails(personId: string | number, apiKey: string, baseUrl?: string): Promise<PersonDetails | null> {
  if (!apiKey) return null;
  const url = baseUrl || process.env.FOOTBALL_API_URL || "https://api.football-data.org/v4";
  try {
    const r = await fetch(`${url}/persons/${personId}`, {
      headers: { "X-Auth-Token": apiKey },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const out: PersonDetails = {};
    if (typeof data.shirtNumber === "number") out.shirtNumber = data.shirtNumber;
    if (data.currentTeam?.name) out.club = data.currentTeam.name;
    return out;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------
 * Full player profile (used by the on-demand player card in the
 * "הנבחרות שלי" tab — /api/players/[id]).
 * ------------------------------------------------------------------- */
export interface PersonProfile {
  id: number;
  name: string;
  dateOfBirth?: string;
  nationality?: string;
  position?: string;
  shirtNumber?: number;
  currentTeam?: {
    name: string;
    crest?: string;
    venue?: string;
    competitions?: string[];
  };
}

export interface PersonRecentMatch {
  date: string;
  competition: string;
  home: string;
  away: string;
  score: string;
  scored: boolean;
  assisted: boolean;
}

export interface PersonSeasonStats {
  matches: number;
  goals: number;
  assists: number;
  minutes: number;
  yellowCards: number;
  redCards: number;
  recent: PersonRecentMatch[];
}

/** Fetch a player's full bio/profile from /persons/{id}. Returns null on
 * any failure (missing key, network error, bad response, not found). */
export async function fetchPersonProfile(personId: string | number, apiKey: string, baseUrl?: string): Promise<PersonProfile | null> {
  if (!apiKey) return null;
  const url = baseUrl || process.env.FOOTBALL_API_URL || "https://api.football-data.org/v4";
  try {
    const r = await fetch(`${url}/persons/${personId}`, {
      headers: { "X-Auth-Token": apiKey },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const out: PersonProfile = { id: data.id, name: data.name };
    if (data.dateOfBirth) out.dateOfBirth = data.dateOfBirth;
    if (data.nationality) out.nationality = data.nationality;
    if (data.position) out.position = data.position;
    if (typeof data.shirtNumber === "number") out.shirtNumber = data.shirtNumber;
    if (data.currentTeam) {
      out.currentTeam = {
        name: data.currentTeam.name,
        crest: data.currentTeam.crest,
        venue: data.currentTeam.venue,
        competitions: (data.currentTeam.runningCompetitions || []).map((c: any) => c.name).filter(Boolean),
      };
    }
    return out;
  } catch {
    return null;
  }
}

/** Fetch a player's current-season match log + aggregated stats (goals,
 * assists, minutes, cards) from /persons/{id}/matches. Returns null on
 * any failure. */
export async function fetchPersonSeasonStats(personId: string | number, apiKey: string, baseUrl?: string): Promise<PersonSeasonStats | null> {
  if (!apiKey) return null;
  const url = baseUrl || process.env.FOOTBALL_API_URL || "https://api.football-data.org/v4";
  try {
    const r = await fetch(`${url}/persons/${personId}/matches?limit=10`, {
      headers: { "X-Auth-Token": apiKey },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const agg = data.aggregations || {};
    const matches: any[] = data.matches || [];
    const recent: PersonRecentMatch[] = matches.slice(0, 8).map((m: any) => {
      const scorerIds = (m.goals || []).map((g: any) => g?.scorer?.id);
      const assistIds = (m.goals || []).map((g: any) => g?.assist?.id);
      const pid = Number(personId);
      return {
        date: m.utcDate,
        competition: m.competition?.name || "",
        home: m.homeTeam?.shortName || m.homeTeam?.name || "",
        away: m.awayTeam?.shortName || m.awayTeam?.name || "",
        score: `${m.score?.fullTime?.home ?? "-"}:${m.score?.fullTime?.away ?? "-"}`,
        scored: scorerIds.includes(pid),
        assisted: assistIds.includes(pid),
      };
    });
    return {
      matches: agg.matchesOnPitch ?? 0,
      goals: agg.goals ?? 0,
      assists: agg.assists ?? 0,
      minutes: agg.minutesPlayed ?? 0,
      yellowCards: agg.yellowCards ?? 0,
      redCards: (agg.redCards ?? 0) + (agg.yellowRedCards ?? 0),
      recent,
    };
  } catch {
    return null;
  }
}

/** Fetch & map the live WC2026 squads/coaches for all 48 teams in ONE
 * football-data.org request. Returns null on any failure (missing key,
 * network error, bad response) so callers can fall back gracefully. */
export async function fetchLiveWcSquads(): Promise<{ squads: LiveSquads; coaches: LiveCoaches } | null> {
  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.FOOTBALL_API_URL || "https://api.football-data.org/v4";

  try {
    const r = await fetch(`${baseUrl}/competitions/WC/teams?season=2026`, {
      headers: { "X-Auth-Token": apiKey },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const teams: any[] = data.teams || [];

    const squads: LiveSquads = {};
    const coaches: LiveCoaches = {};

    for (const t of teams) {
      const code =
        teamCodeFromApiName(t.name) ||
        teamCodeFromApiName(t.shortName) ||
        teamCodeFromApiName(t.tla);
      if (!code) continue;

      const players: Player[] = (t.squad || [])
        .filter((p: any) => POSITION_MAP[p.position])
        .map((p: any): Player => ({
          id: `${code}_${p.id}`,
          teamCode: code,
          name: p.name,
          nameEn: p.name,
          position: POSITION_MAP[p.position],
          age: ageFromDob(p.dateOfBirth) ?? 0,
          live: true,
        }));
      if (players.length) squads[code] = players;

      if (t.coach?.name) {
        coaches[code] = {
          name: t.coach.name,
          nameEn: t.coach.name,
          nationality: t.coach.nationality || "",
          flag: flagForNationality(t.coach.nationality),
        };
      }
    }

    return { squads, coaches };
  } catch {
    return null;
  }
}
