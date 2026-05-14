import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { MATCHES, TEAMS } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* =====================================================================
 * GET /api/cron/sync-results
 *
 * Pulls live World Cup results from an external football data API and
 * writes them to the `match_results` collection.
 *
 * Configuration (Vercel env vars):
 *   FOOTBALL_API_KEY   — required to enable live sync
 *   FOOTBALL_API_URL   — default: https://api.football-data.org/v4
 *   CRON_SECRET        — optional, protects the endpoint from public access
 *
 * If FOOTBALL_API_KEY is not set, the endpoint is a no-op (returns
 * { ok: true, skipped: "not configured" }). This is the safe default
 * during the simulation phase before the tournament.
 *
 * Match mapping: each external match is identified by (date + home team
 * + away team). We map external team codes/names to our internal 3-letter
 * TEAMS codes by checking name+nameEn match.
 *
 * Results are written with `source: "live"` so they're distinguishable
 * from admin-entered or sim-generated results.
 * ===================================================================*/

const SECRET = process.env.CRON_SECRET || "";

export async function GET(req: Request) {
  if (SECRET) {
    const auth = req.headers.get("authorization") || "";
    if (!auth.endsWith(SECRET)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      skipped: "FOOTBALL_API_KEY not configured — live sync is disabled",
      docs: "Set FOOTBALL_API_KEY in Vercel env vars when the tournament starts. The free tier of football-data.org works.",
    });
  }

  const baseUrl = process.env.FOOTBALL_API_URL || "https://api.football-data.org/v4";

  try {
    /* World Cup 2026 — competition code "WC" on football-data.org */
    const r = await fetch(`${baseUrl}/competitions/WC/matches?season=2026`, {
      headers: { "X-Auth-Token": apiKey },
    });
    if (!r.ok) {
      const err = await r.text();
      return NextResponse.json({ error: "api_failed", details: err.slice(0, 500) }, { status: 502 });
    }
    const data = await r.json();
    const externalMatches: any[] = data.matches || [];

    const { db } = getAdmin();
    let inserted = 0, updated = 0, skipped = 0;
    let batch = db.batch();
    let ops = 0;

    for (const ext of externalMatches) {
      if (ext.status !== "FINISHED" && ext.status !== "LIVE" && ext.status !== "IN_PLAY") continue;
      if (!ext.score || ext.score.fullTime?.home == null || ext.score.fullTime?.away == null) continue;

      const ourMatch = findOurMatch(ext);
      if (!ourMatch) { skipped++; continue; }

      const ref = db.collection("match_results").doc(ourMatch.id);
      const existing = await ref.get();
      const finishedAt = ext.lastUpdated ? new Date(ext.lastUpdated).getTime() : Date.now();

      const doc: any = {
        matchId: ourMatch.id,
        home: ext.score.fullTime.home,
        away: ext.score.fullTime.away,
        finishedAt,
        sim: false,
        source: "live",
        liveStatus: ext.status,
        liveExternalId: ext.id,
      };

      batch.set(ref, doc, { merge: true });
      ops++;
      if (existing.exists) updated++;
      else inserted++;

      if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();

    return NextResponse.json({ ok: true, inserted, updated, skipped, total: externalMatches.length });
  } catch (e: any) {
    return NextResponse.json({ error: "sync_failed", message: e?.message || String(e) }, { status: 500 });
  }
}

/* Map an external match (football-data.org schema) to our MATCHES entry.
 * Strategy: match by UTC date (Israel-aware) + both teams by name. */
function findOurMatch(ext: any): { id: string } | null {
  const extDate = ext.utcDate ? new Date(ext.utcDate).toISOString().slice(0, 10) : null;
  const extHome = (ext.homeTeam?.name || "").toLowerCase();
  const extAway = (ext.awayTeam?.name || "").toLowerCase();
  if (!extDate || !extHome || !extAway) return null;

  for (const m of MATCHES) {
    if (m.stage !== "GROUP") continue; /* knockouts have placeholders; skip auto-mapping */
    const ourDate = new Date(m.utc).toISOString().slice(0, 10);
    if (ourDate !== extDate) continue;
    const home = TEAMS[m.home];
    const away = TEAMS[m.away];
    const homeMatch = home && (home.nameEn.toLowerCase() === extHome || extHome.includes(home.nameEn.toLowerCase()));
    const awayMatch = away && (away.nameEn.toLowerCase() === extAway || extAway.includes(away.nameEn.toLowerCase()));
    if (homeMatch && awayMatch) return { id: m.id };
  }
  return null;
}
