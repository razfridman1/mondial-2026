import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import { listSeasonMatches, parse1X2Odds, hasFootballDataIoKey, WC_SEASON_ID } from "@/lib/footballdata-io";
import { teamCodeFromApiName } from "@/lib/team-name-mapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* =====================================================================
 * GET /api/cron/sync-odds
 *
 * Pulls REAL 1X2 betting odds for World Cup 2026 group-stage matches from
 * footballdata.io (league_id=50, season_id=618 — "International World Cup",
 * 2026) and caches them in Firestore (live_data/match_odds/{matchId}).
 * The UI reads the cache via /api/match-odds.
 *
 * A single request to /seasons/618/matches?limit=100 returns all 72
 * group-stage matches, each with `odds: { home_win, draw, away_win }`
 * embedded directly. Sportsbooks only price matches close to kickoff —
 * far-future matches come back as {0,0,0}, which parse1X2Odds() rejects
 * (returns null). We NEVER fabricate odds: only matches with valid
 * (>1) odds for all three outcomes are written to the cache.
 *
 * Matching: each footballdata.io match is mapped to one of our internal
 * GROUP-stage MATCHES by (date, home/away team codes via
 * teamCodeFromApiName), allowing for swapped home/away order.
 *
 * Auth: same CRON_SECRET pattern as other cron routes (no-op if unset).
 * ===================================================================*/

const SECRET = process.env.CRON_SECRET || "";
const SEASON_ID = WC_SEASON_ID; // World Cup 2026 on footballdata.io (league_id=50)

export async function GET(req: Request) {
  if (SECRET) {
    const auth = req.headers.get("authorization") || "";
    if (!auth.endsWith(SECRET)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  if (!hasFootballDataIoKey()) {
    return NextResponse.json({ ok: false, error: "FOOTBALLDATA_IO_API_KEY not configured" });
  }

  const fdMatches = await listSeasonMatches(SEASON_ID, { limit: 100, maxPages: 1 });

  const updates: Record<string, any> = {};
  let priced = 0;
  let matched = 0;

  for (const fm of fdMatches) {
    const odds = parse1X2Odds(fm.odds);
    if (!odds) continue; // unpriced (zeros) or missing — never fabricate
    priced++;

    const homeCode = teamCodeFromApiName(fm.home_team?.team_name);
    const awayCode = teamCodeFromApiName(fm.away_team?.team_name);
    if (!homeCode || !awayCode) continue;

    const fdDate = fm.date_unix
      ? new Date(fm.date_unix * 1000).toISOString().slice(0, 10)
      : (fm.match_date || "").slice(0, 10);
    if (!fdDate) continue;

    const our = MATCHES.find(m => {
      if (m.stage !== "GROUP") return false;
      const ourDate = new Date(m.utc).toISOString().slice(0, 10);
      if (ourDate !== fdDate) return false;
      const direct = m.home === homeCode && m.away === awayCode;
      const swap = m.home === awayCode && m.away === homeCode;
      return direct || swap;
    });
    if (!our) continue;

    matched++;
    updates[our.id] = { ...odds, updatedAt: Date.now() };
  }

  if (Object.keys(updates).length) {
    const { db } = getAdmin();
    await db.collection("live_data").doc("match_odds").set(updates, { merge: true });
  }

  return NextResponse.json({ ok: true, fdMatches: fdMatches.length, priced, matched, updated: Object.keys(updates).length });
}
