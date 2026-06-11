/* =====================================================================
 * footballdata.io — real betting odds (1X2) for World Cup 2026 matches.
 * Server-only (uses FOOTBALLDATA_IO_API_KEY).
 *
 * footballdata.io exposes REST endpoints under /api/v1, authenticated via
 * `Authorization: Bearer <key>`. Responses are wrapped as
 * { success, data, meta }. Relevant endpoints for us:
 *   GET /leagues                       — find the World Cup 2026 league_id
 *   GET /leagues/{id}/seasons          — find the 2026 season_id
 *   GET /seasons/{id}/matches          — list matches (with footballdata.io match_id)
 *   GET /matches/{match_id}/odds       — 1X2 odds for a specific match
 *
 * We map footballdata.io team names → our internal 3-letter codes via
 * teamCodeFromApiName (lib/team-name-mapper.ts), and footballdata.io
 * match_ids → our internal match ids by (homeCode, awayCode, date).
 *
 * NEVER fabricate odds: every helper here returns null on any failure
 * (missing key, network error, unexpected shape, no markets available).
 * ===================================================================*/
import type { Odds } from "./types";

const BASE_URL = process.env.FOOTBALLDATA_IO_URL || "https://footballdata.io/api/v1";

function apiKey(): string | undefined {
  return process.env.FOOTBALLDATA_IO_API_KEY;
}

export function hasFootballDataIoKey(): boolean {
  return !!apiKey();
}

/** Low-level GET against footballdata.io. Returns the unwrapped `data`
 * field on success, or null on any failure. */
export async function fdGet(path: string): Promise<any | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const r = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return null;
    const json = await r.json();
    if (json?.success === false) return null;
    return json?.data ?? json;
  } catch {
    return null;
  }
}

/** Raw GET that returns the full envelope (success/data/meta/error) — used
 * by the admin debug route so we can inspect shapes & error messages. */
export async function fdGetRaw(path: string): Promise<{ ok: boolean; status?: number; body: any }> {
  const key = apiKey();
  if (!key) return { ok: false, body: { error: "FOOTBALLDATA_IO_API_KEY not configured" } };
  try {
    const r = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, body };
  } catch (e: any) {
    return { ok: false, body: { error: e?.message || String(e) } };
  }
}

export interface FdMatch {
  match_id: number;
  match_date?: string;
  date_unix?: number;
  status?: string;
  home_team?: { team_id?: number; team_name?: string };
  away_team?: { team_id?: number; team_name?: string };
}

/** List matches for a given footballdata.io season_id (paginated; we pull
 * up to `maxPages` pages of `limit` each — World Cup 2026 has 104 matches
 * total so 2 pages of 100 covers it). */
export async function listSeasonMatches(seasonId: number | string, opts: { limit?: number; maxPages?: number } = {}): Promise<FdMatch[]> {
  const limit = opts.limit ?? 100;
  const maxPages = opts.maxPages ?? 3;
  const out: FdMatch[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await fdGet(`/seasons/${seasonId}/matches?page=${page}&limit=${limit}`);
    const matches: FdMatch[] = Array.isArray(data) ? data : (data?.matches || data?.items || []);
    if (!matches.length) break;
    out.push(...matches);
    if (matches.length < limit) break;
  }
  return out;
}

/** Parsed 1X2 odds for a single match. footballdata.io's documented shape
 * for /matches/{id}/odds is loosely specified ("main 1X2 market odds and
 * other supported market fields when available") — this parser tries
 * several plausible shapes and returns null if none match, so we never
 * fabricate a number. */
export function parse1X2Odds(raw: any): Odds | null {
  if (!raw) return null;

  // Shape A: { "1x2": { home, draw, away } } or { home_win, draw, away_win }
  const candidates = [
    raw["1x2"],
    raw["1X2"],
    raw,
    raw?.odds?.["1x2"],
    raw?.odds,
    raw?.main,
    raw?.markets?.["1x2"],
  ].filter(Boolean);

  for (const c of candidates) {
    const home = c.home ?? c.home_win ?? c["1"] ?? c.homeWin;
    const draw = c.draw ?? c.x ?? c["x"] ?? c["X"];
    const away = c.away ?? c.away_win ?? c["2"] ?? c.awayWin;
    if (home != null && draw != null && away != null) {
      const h = Number(home), d = Number(draw), a = Number(away);
      if (h > 1 && d > 1 && a > 1) {
        return { home: h.toFixed(2), draw: d.toFixed(2), away: a.toFixed(2) };
      }
    }
  }

  // Shape B: array of bookmakers, each with a "1x2"/"match_winner" market
  const bookmakers = raw.bookmakers || raw.markets;
  if (Array.isArray(bookmakers)) {
    for (const bm of bookmakers) {
      const market = bm?.["1x2"] || bm?.match_winner || bm?.odds;
      const parsed = parse1X2Odds(market);
      if (parsed) return parsed;
    }
  }

  return null;
}

/** Fetch + parse 1X2 odds for a single footballdata.io match_id. */
export async function fetchMatchOdds(matchId: number | string): Promise<Odds | null> {
  const data = await fdGet(`/matches/${matchId}/odds`);
  return parse1X2Odds(data);
}
