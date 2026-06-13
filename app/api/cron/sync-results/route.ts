import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { MATCHES, TEAMS } from "@/lib/data";
import { resolveAllStages } from "@/lib/bracket";
import { teamCodeFromApiName } from "@/lib/team-name-mapper";
import type { MatchResult } from "@/lib/standings";
import { fetchExternalMatchDetails } from "@/lib/football-data-api";
import { generateMatchSummaryNarrative } from "@/lib/matchSummary";
import { listSeasonMatches, parseFdMatchResult, hasFootballDataIoKey, WC_SEASON_ID, type FdMatch } from "@/lib/footballdata-io";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* =====================================================================
 * GET /api/cron/sync-results
 *
 * Pulls live World Cup results and writes them to the `match_results`
 * collection — fully automatic, no manual admin action required.
 *
 * TWO INDEPENDENT SOURCES, checked in parallel every minute:
 *   1. football-data.org (PRIMARY) — full match feed incl. knockout
 *      winner/penalties, used to build post-match summaries.
 *   2. footballdata.io   (SECONDARY, group stage) — used to CONFIRM the
 *      primary result (doc.confirmedBy) or flag a discrepancy
 *      (doc.secondarySourceMismatch) for admin review. If the primary
 *      source isn't configured or hasn't reported a match as finished
 *      yet, the secondary source's result is written on its own
 *      (source: "live-footballdata.io") so the result still appears
 *      immediately.
 *
 * Configuration (Vercel env vars):
 *   FOOTBALL_API_KEY      — football-data.org (primary)
 *   FOOTBALLDATA_IO_API_KEY — footballdata.io (secondary/cross-check)
 *   FOOTBALL_API_URL      — default: https://api.football-data.org/v4
 *   CRON_SECRET           — optional, protects the endpoint
 *
 * If NEITHER key is set, the endpoint is a no-op
 * ({ ok: true, skipped: "not configured" }).
 *
 * Manual fallback: admin-entered results (/api/admin/results, which set
 * `setByAdmin: true`) are NEVER overwritten by this sync — so manual
 * entry remains available as a safety net if auto-sync can't find or
 * resolve a match, without auto-sync fighting back over it.
 *
 * Match mapping: each external match is identified by (date + home team
 * + away team), mapping external team codes/names to our internal
 * 3-letter TEAMS codes via teamCodeFromApiName.
 * ===================================================================*/

const SECRET = process.env.CRON_SECRET || "";

type StoredResult = MatchResult & { setByAdmin?: boolean };

export async function GET(req: Request) {
  if (SECRET) {
    const auth = req.headers.get("authorization") || "";
    if (!auth.endsWith(SECRET)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const apiKey = process.env.FOOTBALL_API_KEY;
  const hasFD = !!apiKey;
  const hasFDIO = hasFootballDataIoKey();

  if (!hasFD && !hasFDIO) {
    return NextResponse.json({
      ok: true,
      skipped: "no result source configured",
      docs: "Set FOOTBALL_API_KEY and/or FOOTBALLDATA_IO_API_KEY in Vercel env vars when the tournament starts. The free tier of football-data.org works.",
    });
  }

  /* ----- Rate-limit guard ---------------------------------------------
   * The cron is scheduled every minute. To stay inside the free tiers we
   * ONLY call the external APIs when at least one match is "active" —
   * defined as starting within the next 15 minutes through 3 hours after
   * kickoff (covers 90' + ET + penalties + admin lag). Outside those
   * windows we short-circuit and return ok with skipped="no-active".
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
    const { db } = getAdmin();

    /* Build the bracket resolver from EXISTING results so we know which
     * real team is playing each knockout match. This lets us match
     * external knockout fixtures (which have real team names) to our
     * placeholder-driven matches (1A, W R32-1, etc). */
    const existingResSnap = await db.collection("match_results").get();
    const existingResults: Record<string, StoredResult> = {};
    existingResSnap.forEach(d => {
      const data = d.data() as any;
      existingResults[d.id] = {
        home: data.home, away: data.away, finishedAt: data.finishedAt || 0,
        ...(data.winner ? { winner: data.winner } : {}),
        setByAdmin: !!data.setByAdmin,
      };
    });
    const resolved = resolveAllStages(existingResults);

    /* ----- Fetch both sources in parallel ---------------------------- */
    const [fdOrg, fdio] = await Promise.all([
      hasFD ? fetchFootballDataOrgMatches(baseUrl, apiKey!) : Promise.resolve(null),
      hasFDIO ? listSeasonMatches(WC_SEASON_ID, { limit: 100, maxPages: 1 }).catch(() => [] as FdMatch[]) : Promise.resolve([] as FdMatch[]),
    ]);

    if (!fdOrg && !hasFDIO) {
      // Only source configured failed outright.
      return NextResponse.json({ error: "api_failed", details: "football-data.org request failed" }, { status: 502 });
    }

    const externalMatches: any[] = fdOrg?.matches || [];
    const fdOrgError = fdOrg?.error || null;

    /* Map footballdata.io's finished group-stage matches to our match ids,
     * normalized to OUR home/away order. */
    const fdioResultsByMatch: Record<string, { home: number; away: number }> = {};
    for (const fm of fdio) {
      const result = parseFdMatchResult(fm);
      if (!result) continue;

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

      let home = result.home, away = result.away;
      if (our.home === awayCode && our.away === homeCode) { [home, away] = [away, home]; }
      fdioResultsByMatch[our.id] = { home, away };
    }

    /* Existing post-match summaries — used to avoid regenerating (and
     * re-calling the AI / external API) for matches we've already
     * summarized. */
    const summariesSnap = await db.collection("live_data").doc("match_summaries").get();
    const existingSummaries: Record<string, any> = summariesSnap.exists ? (summariesSnap.data() || {}) : {};
    const summaryCandidates: Array<{ matchId: string; externalId: any; homeCode: string; awayCode: string; homeScore: number; awayScore: number }> = [];

    let inserted = 0, updated = 0, skipped = 0, skippedAdminLocked = 0, confirmed = 0, mismatches = 0;
    let batch = db.batch();
    let ops = 0;

    for (const ext of externalMatches) {
      if (ext.status !== "FINISHED" && ext.status !== "LIVE" && ext.status !== "IN_PLAY") continue;
      if (!ext.score || ext.score.fullTime?.home == null || ext.score.fullTime?.away == null) continue;

      const ourMatch = findOurMatch(ext, resolved);
      if (!ourMatch) { skipped++; continue; }

      /* Respect a manually-entered admin result — admin entry is the
       * fallback for when auto-sync can't find/resolve a match; don't
       * let auto-sync fight back over it. */
      if (existingResults[ourMatch.id]?.setByAdmin) { skippedAdminLocked++; continue; }

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

      /* Cross-check against the secondary source (group stage only). */
      const fdioResult = fdioResultsByMatch[ourMatch.id];
      if (fdioResult) {
        if (fdioResult.home === doc.home && fdioResult.away === doc.away) {
          doc.confirmedBy = "footballdata.io";
          confirmed++;
        } else {
          doc.secondarySourceMismatch = { source: "footballdata.io", home: fdioResult.home, away: fdioResult.away, checkedAt: Date.now() };
          mismatches++;
        }
        delete fdioResultsByMatch[ourMatch.id]; // handled — don't double-write below
      }

      batch.set(ref, doc, { merge: true });
      ops++;
      if (existing.exists) updated++;
      else inserted++;

      /* Queue a post-match summary for newly-finished matches we haven't
       * summarized yet (see lib/matchSummary.ts). */
      if (ext.status === "FINISHED" && !existingSummaries[ourMatch.id]) {
        let homeCode = ourMatchRecord?.home;
        let awayCode = ourMatchRecord?.away;
        if (isKO) {
          const r = resolved[ourMatch.id];
          if (r?.home && r?.away) { homeCode = r.home; awayCode = r.away; }
        }
        if (homeCode && awayCode) {
          summaryCandidates.push({
            matchId: ourMatch.id,
            externalId: ext.id,
            homeCode,
            awayCode,
            homeScore: ext.score.fullTime.home,
            awayScore: ext.score.fullTime.away,
          });
        }
      }

      if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
    }

    /* ----- Secondary-only writes --------------------------------------
     * Any footballdata.io-confirmed-finished GROUP match the primary
     * source didn't cover this run (not configured, or not yet reporting
     * FINISHED) gets written on its own so the result still appears
     * immediately. Skipped for admin-locked results, and skipped if it'd
     * be a no-op (identical score already stored). */
    let fdioOnlyWrites = 0;
    for (const [matchId, fres] of Object.entries(fdioResultsByMatch)) {
      const existing = existingResults[matchId];
      if (existing?.setByAdmin) { skippedAdminLocked++; continue; }
      if (existing && existing.home === fres.home && existing.away === fres.away) continue;

      const ref = db.collection("match_results").doc(matchId);
      batch.set(ref, {
        matchId,
        home: fres.home,
        away: fres.away,
        finishedAt: Date.now(),
        sim: false,
        source: "live-footballdata.io",
      }, { merge: true });
      ops++;
      fdioOnlyWrites++;
      if (existing) updated++; else inserted++;
      if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
    }

    if (ops > 0) await batch.commit();

    /* Generate post-match summaries (real data + AI narrative) for any
     * newly-finished matches. Limited per run to avoid timeouts/rate
     * limits — at most one match normally finishes per minute anyway.
     * Requires football-data.org (the only source with goal/card detail). */
    let summariesGenerated = 0;
    if (hasFD && summaryCandidates.length) {
      const summaryUpdates: Record<string, any> = {};
      for (const cand of summaryCandidates.slice(0, 2)) {
        try {
          const details = await fetchExternalMatchDetails(cand.externalId, apiKey!, baseUrl);
          if (!details) continue;
          const text = await generateMatchSummaryNarrative({
            matchId: cand.matchId,
            homeName: TEAMS[cand.homeCode]?.name || cand.homeCode,
            awayName: TEAMS[cand.awayCode]?.name || cand.awayCode,
            homeScore: cand.homeScore,
            awayScore: cand.awayScore,
            details,
          });
          summaryUpdates[cand.matchId] = { text, generatedAt: Date.now() };
          summariesGenerated++;
        } catch {
          // skip — will retry on a later run since existingSummaries won't have it
        }
      }
      if (Object.keys(summaryUpdates).length) {
        await db.collection("live_data").doc("match_summaries").set(summaryUpdates, { merge: true });
      }
    }

    return NextResponse.json({
      ok: true,
      inserted, updated, skipped,
      skippedAdminLocked,
      total: externalMatches.length,
      summariesGenerated,
      sources: {
        "football-data.org": hasFD ? (fdOrgError ? `error: ${fdOrgError}` : "ok") : "not configured",
        "footballdata.io": hasFDIO ? "ok" : "not configured",
      },
      crossCheck: { confirmed, mismatches, fdioOnlyWrites },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "sync_failed", message: e?.message || String(e) }, { status: 500 });
  }
}

/* Fetch the World Cup match list from football-data.org. Returns null on
 * network failure; returns { matches: [], error } on a non-OK response so
 * the caller can still proceed with the secondary source. */
async function fetchFootballDataOrgMatches(baseUrl: string, apiKey: string): Promise<{ matches: any[]; error?: string } | null> {
  try {
    const r = await fetch(`${baseUrl}/competitions/WC/matches?season=2026`, {
      headers: { "X-Auth-Token": apiKey },
    });
    if (!r.ok) {
      const err = await r.text();
      return { matches: [], error: `${r.status} ${err.slice(0, 200)}` };
    }
    const data = await r.json();
    return { matches: data.matches || [] };
  } catch {
    return null;
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
