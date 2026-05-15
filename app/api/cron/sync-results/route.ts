import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import { resolveAllStages } from "@/lib/bracket";
import { teamCodeFromApiName } from "@/lib/team-name-mapper";
import type { MatchResult } from "@/lib/standings";

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

  /* ----- Rate-limit guard ---------------------------------------------
   * The cron is scheduled every minute. To stay inside football-data.org's
   * free tier we ONLY call the external API when at least one match is
   * "active" — defined as starting within the next 15 minutes through
   * 3 hours after kickoff (covers 90' + injury time + admin lag). Outside
   * those windows we short-circuit and return ok with skipped="no-active".
   * If the request includes ?force=1 we bypass the guard (manual sync). */
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  if (!force) {
    const now = Date.now();
    const PRE_MS  = 15 * 60 * 1000;        // start syncing 15 min before kickoff
    const POST_MS = 3 * 60 * 60 * 1000;    // keep syncing 3h after kickoff
    const active = MATCHES.some(m => {
      const t = new Date(m.utc).getTime();
      return now >= t - PRE_MS && now <= t + POST_MS;
    });
    if (!active) {
      return NextResponse.json({ ok: true, skipped: "no-active-match-window" });
    }
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

    /* Build the bracket resolver from EXISTING results so we know which
     * real team is playing each knockout match. This lets us match
     * external knockout fixtures (which have real team names) to our
     * placeholder-driven matches (1A, W R32-1, etc). */
    const existingResSnap = await db.collection("match_results").get();
    const existingResults: Record<string, MatchResult> = {};
    existingResSnap.forEach(d => {
      const data = d.data() as any;
      existingResults[d.id] = { home: data.home, away: data.away, finishedAt: data.finishedAt || 0 };
    });
    const resolved = resolveAllStages(existingResults);

    let inserted = 0, updated = 0, skipped = 0;
    let batch = db.batch();
    let ops = 0;

    for (const ext of externalMatches) {
      if (ext.status !== "FINISHED" && ext.status !== "LIVE" && ext.status !== "IN_PLAY") continue;
      if (!ext.score || ext.score.fullTime?.home == null || ext.score.fullTime?.away == null) continue;

      const ourMatch = findOurMatch(ext, resolved);
      if (!ourMatch) { skipped++; continue; }

      const ref = db.collection("match_results").doc(ourMatch.id);
      const existing = await ref.get();
      const finishedAt = ext.lastUpdated ? new Date(ext.lastUpdated).getTime() : Date.now();

      /* Look up our match to know stage / knockout / and resolved teams. */
      const ourMatchRecord = MATCHES.find(mm => mm.id === ourMatch.id);
      const isKO = !!(ourMatchRecord && ourMatchRecord.stage !== "GROUP");

      const doc: any = {
        matchId: ourMatch.id,
        home: ext.score.fullTime.home,
        away: ext.score.fullTime.away,
        finishedAt,
        sim: false,
        source: "live",
        liveStatus: ext.status,
        liveExternalId: ext.id,
        ...(isKO ? { isKnockout: true } : {}),
      };

      /* For knockouts: pick the real winner (after ET/pens if present),
       * using football-data.org's `winner` field on score. */
      if (isKO && ext.status === "FINISHED") {
        const koResolved = resolved[ourMatch.id];
        const winnerSide = ext.score.winner; // "HOME_TEAM" | "AWAY_TEAM" | "DRAW"
        if (winnerSide === "HOME_TEAM" && koResolved?.home) doc.winner = koResolved.home;
        else if (winnerSide === "AWAY_TEAM" && koResolved?.away) doc.winner = koResolved.away;
        /* Note: KO games never end in DRAW per FIFA rules; if the API
         * still reports DRAW we'll leave winner unset until updated. */
      }

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
 * Strategy:
 *   - Group stage: match by date + both teams by name (teams are real codes).
 *   - Knockouts: use the bracket resolver to know which real teams ARE in
 *     each placeholder slot, then match by date + both teams.
 *
 * Direction-agnostic: external feed may have home/away swapped relative
 * to our scheduled order, so we accept either order.
 */
function findOurMatch(
  ext: any,
  resolved: Record<string, { home: string; away: string; winner: string; loser: string }>,
): { id: string } | null {
  const extDate = ext.utcDate ? new Date(ext.utcDate).toISOString().slice(0, 10) : null;
  const extHomeCode = teamCodeFromApiName(ext.homeTeam?.name) || teamCodeFromApiName(ext.homeTeam?.shortName);
  const extAwayCode = teamCodeFromApiName(ext.awayTeam?.name) || teamCodeFromApiName(ext.awayTeam?.shortName);
  if (!extDate || !extHomeCode || !extAwayCode) return null;

  function nameMatches(code: string | undefined, extCode: string): boolean {
    return !!code && !!extCode && code === extCode;
  }

  for (const m of MATCHES) {
    const ourDate = new Date(m.utc).toISOString().slice(0, 10);
    if (ourDate !== extDate) continue;

    /* For group stage, m.home/m.away are real team codes. For knockouts,
     * pull the resolved codes from the bracket resolver. */
    let homeCode = m.home;
    let awayCode = m.away;
    if (m.stage !== "GROUP") {
      const r = resolved[m.id];
      if (!r || !r.home || !r.away) continue; /* not yet resolved → skip */
      homeCode = r.home;
      awayCode = r.away;
    }

    /* Try both orderings — football-data may swap home/away. */
    const matchDirect = nameMatches(homeCode, extHomeCode) && nameMatches(awayCode, extAwayCode);
    const matchSwap   = nameMatches(homeCode, extAwayCode) && nameMatches(awayCode, extHomeCode);
    if (matchDirect || matchSwap) return { id: m.id };
  }
  return null;
}
