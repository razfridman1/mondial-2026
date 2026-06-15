import { getAdmin } from "@/lib/firebase-admin";
import { MATCHES, TEAMS } from "@/lib/data";
import { resolveAllStages } from "@/lib/bracket";
import { teamCodeFromApiName } from "@/lib/team-name-mapper";
import type { MatchResult } from "@/lib/standings";
import { fetchExternalMatchDetails } from "@/lib/football-data-api";
import { generateMatchSummaryNarrative } from "@/lib/matchSummary";
import { lookupResultViaAI, lookupGoalsViaAI, aiGoalsToExternalGoals, type AiResultLookup } from "@/lib/ai-result-fallback";

/* =====================================================================
 * Core results-sync logic, shared by:
 *   - app/api/cron/sync-results/route.ts (Vercel Cron, every minute)
 *   - app/api/match-results/route.ts (opportunistic redundant trigger —
 *     fires if the cron hasn't run recently, see isWithinActiveWindow /
 *     STALE_MS there). This gives a backup path that doesn't depend on
 *     Vercel Cron actually firing (per user requirement: "אם ה-cron נכשל
 *     — אין מנגנון גיבוי אוטומטי מלא").
 *
 * RESULT POLICY (match_results/{matchId}.home / .away / .winner /
 * .finishedAt) — per explicit user instruction: the FINAL SCORE of a
 * match that has ended is determined EXCLUSIVELY via the AI web-search
 * fallback (lookupResultViaAI in lib/ai-result-fallback.ts, which calls
 * the Anthropic API). football-data.org and footballdata.io are NEVER
 * used to write match_results — only the AI path below does. The
 * "trigger" for when a match has ended is the kickoff+buffer check in the
 * AI fallback loop below (GROUP_BUFFER_MS / KO_BUFFER_MS), which retries
 * every cron minute until the AI confirms a real, sourced final score.
 *
 * football-data.org (PRIMARY, if FOOTBALL_API_KEY is configured) is still
 * used for a SEPARATE concern: enriching already-decided matches with a
 * goalscorer/assist breakdown and an AI-written post-match summary
 * narrative (live_data/match_goals, live_data/match_summaries). It plays
 * no role in determining the result itself.
 *
 * AI WEB-SEARCH FALLBACK (lib/ai-result-fallback.ts):
 *   - Final score for a match that should already be over (PRIMARY/ONLY
 *     source for match_results).
 *   - Identifying BOTH teams + score for an unresolved knockout bracket
 *     slot (by stage + date, when neither prior-round result is in yet).
 *   - Goalscorer/assist breakdown for /api/scorers when football-data.org
 *     details aren't available.
 * NEVER FABRICATES: anything not returned with a real, sourced answer is
 * left alone and retried on a later run.
 *
 * Configuration (Vercel env vars):
 *   ANTHROPIC_API_KEY       — AI web-search fallback (results + goals) —
 *                              REQUIRED for match_results to ever be filled.
 *   FOOTBALL_API_KEY        — football-data.org — optional, used only for
 *                              goal breakdowns + summary narratives.
 *   FOOTBALL_API_URL        — default: https://api.football-data.org/v4
 *
 * Manual fallback: admin-entered results (/api/admin/results, which set
 * `setByAdmin: true`) are NEVER overwritten by this sync.
 * ===================================================================*/

/* ----- Active-window guard -------------------------------------------
 * External APIs (and the AI fallback) are only worth calling when at
 * least one match is "active" — starting within the next 15 minutes
 * through POST_MS after kickoff. POST_MS was extended from 3h to 8h so
 * that the AI fallback keeps retrying (once per run, ~once/minute) for
 * the vast majority of plausible delays in source updates — closing the
 * gaps "חלון זמן מוגבל" / "לא מתבצע ניסיון נוסף אחרי סגירת החלון". */
export const PRE_MS = 15 * 60 * 1000;
export const POST_MS = 8 * 60 * 60 * 1000;

export function isWithinActiveWindow(now: number = Date.now()): boolean {
  return MATCHES.some(m => {
    const t = new Date(m.utc).getTime();
    return now >= t - PRE_MS && now <= t + POST_MS;
  });
}

/* Hebrew labels for knockout stages — used when asking the AI to identify
 * an unresolved bracket slot's two teams by stage + date. */
const STAGE_LABEL_HE: Record<string, string> = {
  R32: "שלב ה-32 האחרונות (סיבוב שמינית הגמר הראשון)",
  R16: "שמינית הגמר",
  QF: "רבע הגמר",
  SF: "חצי הגמר",
  THIRD: "גמר מקום שלישי",
  FINAL: "הגמר",
};

type StoredResult = MatchResult & {
  setByAdmin?: boolean;
  verificationCount?: number;
  source?: string;
  lastVerifiedAt?: number;
  aiMismatch?: unknown;
};

export interface SyncResult {
  ok: boolean;
  status?: number;
  [k: string]: any;
}

export async function runResultsSync(opts: { force?: boolean; debug?: boolean } = {}): Promise<SyncResult> {
  const apiKey = process.env.FOOTBALL_API_KEY;
  const hasFD = !!apiKey;
  const hasAI = !!process.env.ANTHROPIC_API_KEY;

  if (!hasAI && !hasFD) {
    return {
      ok: true,
      skipped: "no result source configured",
      docs: "Set ANTHROPIC_API_KEY in Vercel env vars — it is the sole source for match_results. FOOTBALL_API_KEY (football-data.org) is optional and only used for goal breakdowns + summaries.",
    };
  }

  if (!opts.force && !isWithinActiveWindow()) {
    return { ok: true, skipped: "no-active-match-window" };
  }

  const baseUrl = process.env.FOOTBALL_API_URL || "https://api.football-data.org/v4";

  try {
    const { db } = getAdmin();

    /* Build the bracket resolver from EXISTING results so we know which
     * real team is playing each knockout match. */
    const existingResSnap = await db.collection("match_results").get();
    const existingResults: Record<string, StoredResult> = {};
    existingResSnap.forEach(d => {
      const data = d.data() as any;
      existingResults[d.id] = {
        home: data.home, away: data.away, finishedAt: data.finishedAt || 0,
        ...(data.winner ? { winner: data.winner } : {}),
        setByAdmin: !!data.setByAdmin,
        verificationCount: data.verificationCount || 0,
        source: data.source,
        lastVerifiedAt: data.lastVerifiedAt || 0,
        aiMismatch: data.aiMismatch,
      };
    });
    const resolved = resolveAllStages(existingResults);

    /* ----- Fetch football-data.org (optional) -------------------------
     * Used ONLY for goal breakdowns + post-match summary narratives below
     * (summaryCandidates). It is NOT used to determine match_results — see
     * the RESULT POLICY note at the top of this file. */
    const fdOrg = hasFD ? await fetchFootballDataOrgMatches(baseUrl, apiKey!) : null;
    const externalMatches: any[] = fdOrg?.matches || [];
    const fdOrgError = fdOrg?.error || null;

    /* Existing post-match summaries / goal data — used to avoid
     * regenerating (and re-calling the AI / external API) for matches
     * we've already processed. Tracked SEPARATELY: a match can already
     * have a summary but still be missing its live_data/match_goals entry
     * — in that case we still need to fetch goals so /api/scorers
     * ("מלך השערים והבישולים") has data for it. */
    const summariesSnap = await db.collection("live_data").doc("match_summaries").get();
    const existingSummaries: Record<string, any> = summariesSnap.exists ? (summariesSnap.data() || {}) : {};
    const goalsSnap = await db.collection("live_data").doc("match_goals").get();
    const existingGoals: Record<string, any> = goalsSnap.exists ? (goalsSnap.data() || {}) : {};
    const summaryCandidates: Array<{ matchId: string; externalId: any; homeCode: string; awayCode: string; homeScore: number; awayScore: number; needsSummary: boolean; needsGoals: boolean }> = [];

    /* A live_data/match_goals entry is only considered "complete" if its
     * goals array's length matches the known final score total. Earlier
     * versions of the AI goals fallback (before the exact-count validation
     * was added) could persist a SHORT goals list (e.g. an own goal missing
     * a scorer, or a partial AI response) — and since `needsGoals` only
     * checked *existence*, those matches were never retried. This treats an
     * incomplete entry the same as a missing one, so it gets re-fetched. */
    const goalsIncomplete = (matchId: string, totalScore: number): boolean => {
      const entry = existingGoals[matchId];
      if (!entry) return true;
      if (totalScore === 0) return false; // 0-0 legitimately has an empty goals array
      return !Array.isArray(entry.goals) || entry.goals.length !== totalScore;
    };

    let inserted = 0, updated = 0, skipped = 0;

    /* Queue a post-match summary and/or goals fetch for matches
     * football-data.org reports as FINISHED. This is enrichment only
     * (goalscorers + narrative) — it never writes match_results. */
    for (const ext of externalMatches) {
      if (ext.status !== "FINISHED") continue;
      if (!ext.score || ext.score.fullTime?.home == null || ext.score.fullTime?.away == null) continue;

      const ourMatch = findOurMatch(ext, resolved);
      if (!ourMatch) { skipped++; continue; }

      const ourMatchRecord = MATCHES.find(mm => mm.id === ourMatch.id);
      const isKO = !!(ourMatchRecord && ourMatchRecord.stage !== "GROUP");

      const needsSummary = !existingSummaries[ourMatch.id];
      const needsGoals = goalsIncomplete(ourMatch.id, ext.score.fullTime.home + ext.score.fullTime.away);
      if (!needsSummary && !needsGoals) continue;

      let homeCode = ourMatchRecord?.home;
      let awayCode = ourMatchRecord?.away;
      if (isKO) {
        const r = resolved[ourMatch.id];
        if (r?.home && r?.away) { homeCode = r.home; awayCode = r.away; }
      }
      if (!homeCode || !awayCode) continue;

      summaryCandidates.push({
        matchId: ourMatch.id,
        externalId: ext.id,
        homeCode,
        awayCode,
        homeScore: ext.score.fullTime.home,
        awayScore: ext.score.fullTime.away,
        needsSummary,
        needsGoals,
      });
    }

    /* ----- AI web-search fallback for RESULTS (SOLE SOURCE) -------------
     * match_results/{matchId}.home/.away/.winner/.finishedAt are written
     * EXCLUSIVELY here, via lookupResultViaAI (Anthropic API + web search).
     * Once a match is past kickoff + buffer (i.e. it has "ended"), ask
     * Claude to find the real final score from a citable source.
     *
     * Handles unresolved knockout bracket slots too: if the bracket
     * resolver doesn't yet know which two teams play this fixture, ask
     * the AI to IDENTIFY both teams (by stage + date) as well as the
     * score, then map the returned team names to our internal codes.
     *
     * NEVER FABRICATES: a result is written only if the model returns
     * found:true with a numeric score it actually sourced AND (for
     * unresolved brackets) team names we can map to real codes.
     *
     * Re-verification: an AI-sourced result ("source": "ai-websearch") is
     * re-checked ~3 minutes later. A disagreeing re-check does NOT
     * overwrite — it flags aiMismatch + needsReview for admin review.
     *
     * Up to RESULT_FALLBACK_BUDGET matches per run (instead of just 1):
     * this AI lookup is the ONLY path that can ever fill in a result
     * automatically (see RESULT POLICY at the top of this file), so a
     * single match whose lookup returned found:false (e.g. ambiguous
     * bracket slot, or the AI just hasn't found a source yet) must NOT
     * permanently `break` the loop and starve every later match of a
     * chance to be checked — a finished match later in the schedule could
     * otherwise sit unfilled forever while an earlier, still-unresolved one
     * kept "using up" the per-run budget. Failed lookups are simply retried
     * on a later run. */
    const RESULT_FALLBACK_BUDGET = 3;
    let resultCallsUsed = 0;
    const aiFallbackResults: any[] = [];
    const debugCandidates: any[] = [];
    if (process.env.ANTHROPIC_API_KEY) {
      const now = Date.now();
      /* IMPORTANT: this `buffer` is a pre-filter to avoid asking the AI
       * about a match before it has REALISTICALLY ended — i.e. including
       * halftime break + stoppage time for regulation matches, and (for
       * knockout matches) extra time + penalties on top of that. We don't
       * have a live-status feed, so these are conservative real-world
       * estimates of "kickoff to final whistle":
       *   - Group/regulation: 90 min play + ~15 min halftime + ~15 min
       *     stoppage/added time  -> ~120 min.
       *   - Knockout: regulation (~120 min incl. halftime+stoppage) + ~15
       *     min break before extra time + 30 min extra time + up to ~20
       *     min for a penalty shootout -> ~185 min.
       *
       * Even after the buffer, lookupResultViaAI() itself does the REAL
       * "has this match finished" check via live web search: it returns
       * found:false if its sources show the match still in progress (e.g.
       * a knockout match that didn't need extra time would already be
       * findable before the full 185 min buffer, but if it's still
       * found:false we simply retry every cron minute until it's true).
       * No result is ever written before the match has truly finished. */
      const GROUP_BUFFER_MS = 120 * 60 * 1000; // ~2h: regulation + halftime + stoppage time
      const KO_BUFFER_MS = 185 * 60 * 1000;    // ~3h05m: regulation + ET + penalties, worst case
      const RECHECK_MS = 3 * 60 * 1000;

      if (opts.debug) {
        debugCandidates.push(
          ...MATCHES.slice(0, 10).map(m => {
            const isKO = m.stage !== "GROUP";
            const kickoff = new Date(m.utc).getTime();
            const buffer = isKO ? KO_BUFFER_MS : GROUP_BUFFER_MS;
            const existing = existingResults[m.id];
            return {
              snapshot: true, matchId: m.id, utc: m.utc, isKO,
              bufferEligible: now >= kickoff + buffer,
              hasExisting: !!existing,
              existing: existing ? {
                home: existing.home, away: existing.away, source: existing.source,
                setByAdmin: existing.setByAdmin, verificationCount: existing.verificationCount,
              } : null,
            };
          })
        );
      }

      for (const m of MATCHES) {
        const isKO = m.stage !== "GROUP";
        const kickoff = new Date(m.utc).getTime();
        const buffer = isKO ? KO_BUFFER_MS : GROUP_BUFFER_MS;
        if (now < kickoff + buffer) continue;

        const existing = existingResults[m.id];
        if (existing?.setByAdmin) continue;

        let candidate: "new" | "recheck" | null = null;
        if (!existing) candidate = "new";
        else if (
          existing.source === "ai-websearch" &&
          !existing.aiMismatch &&
          (existing.verificationCount || 0) < 3 &&
          now - (existing.lastVerifiedAt || 0) >= RECHECK_MS
        ) candidate = "recheck";

        if (opts.debug && debugCandidates.length < 15) {
          debugCandidates.push({
            matchId: m.id, isKO, kickoff: m.utc, candidate,
            existing: existing ? {
              home: existing.home, away: existing.away, source: existing.source,
              verificationCount: existing.verificationCount, lastVerifiedAt: existing.lastVerifiedAt,
              setByAdmin: existing.setByAdmin, aiMismatch: existing.aiMismatch,
            } : null,
          });
        }

        if (!candidate) continue;
        if (resultCallsUsed >= RESULT_FALLBACK_BUDGET) continue; // budget reached — retry on a later run

        let homeCode: string | undefined = m.home;
        let awayCode: string | undefined = m.away;
        let lookup: AiResultLookup;

        if (isKO) {
          const r = resolved[m.id];
          if (r?.home && r?.away) {
            homeCode = r.home; awayCode = r.away;
            const homeName = TEAMS[homeCode]?.nameEn || TEAMS[homeCode]?.name || homeCode;
            const awayName = TEAMS[awayCode]?.nameEn || TEAMS[awayCode]?.name || awayCode;
            lookup = await lookupResultViaAI({ homeName, awayName, dateISO: m.utc, isKnockout: true });
          } else {
            /* Unresolved bracket slot — ask the AI to identify BOTH teams
             * (by stage + date) as well as the score. */
            const stageLabel = STAGE_LABEL_HE[m.stage] || m.stage;
            const idLookup = await lookupResultViaAI({ stageLabel, dateISO: m.utc, isKnockout: true });
            if (idLookup.found && idLookup.homeTeamName && idLookup.awayTeamName) {
              const hc = teamCodeFromApiName(idLookup.homeTeamName);
              const ac = teamCodeFromApiName(idLookup.awayTeamName);
              if (hc && ac) {
                homeCode = hc; awayCode = ac;
                lookup = idLookup;
              } else {
                lookup = { found: false };
              }
            } else {
              lookup = { found: false };
            }
          }
        } else {
          const homeName = TEAMS[homeCode]?.nameEn || TEAMS[homeCode]?.name || homeCode;
          const awayName = TEAMS[awayCode]?.nameEn || TEAMS[awayCode]?.name || awayCode;
          lookup = await lookupResultViaAI({ homeName, awayName, dateISO: m.utc, isKnockout: false });
        }
        resultCallsUsed++;

        if (!lookup.found || lookup.home == null || lookup.away == null || !homeCode || !awayCode) {
          aiFallbackResults.push({ matchId: m.id, candidate, found: false, reason: lookup.reason || (!homeCode || !awayCode ? "missing_team_code" : undefined) });
          continue; // try other matches this run too — retried on a later run
        }

        const ref = db.collection("match_results").doc(m.id);
        if (candidate === "new") {
          const doc: any = {
            matchId: m.id,
            home: lookup.home,
            away: lookup.away,
            finishedAt: now,
            sim: false,
            source: "ai-websearch",
            aiSources: lookup.sources || [],
            verificationCount: 1,
            lastVerifiedAt: now,
            ...(isKO ? { isKnockout: true } : {}),
          };
          if (isKO && lookup.winnerSide && lookup.winnerSide !== "DRAW") {
            if (lookup.winnerSide === "HOME") doc.winner = homeCode;
            else if (lookup.winnerSide === "AWAY") doc.winner = awayCode;
          }
          await ref.set(doc, { merge: true });
          inserted++;
          existingResults[m.id] = {
            home: doc.home, away: doc.away, finishedAt: doc.finishedAt, winner: doc.winner,
            source: doc.source, verificationCount: doc.verificationCount, lastVerifiedAt: doc.lastVerifiedAt,
          } as StoredResult;
          aiFallbackResults.push({ matchId: m.id, candidate, found: true, written: true });
        } else {
          const sameScore = existing!.home === lookup.home && existing!.away === lookup.away;
          if (sameScore) {
            const newCount = (existing!.verificationCount || 0) + 1;
            const update: any = { verificationCount: newCount, lastVerifiedAt: now };
            if (newCount >= 3) update.verified = true;
            await ref.set(update, { merge: true });
            updated++;
            existingResults[m.id] = { ...existing!, verificationCount: newCount, lastVerifiedAt: now };
            aiFallbackResults.push({ matchId: m.id, candidate, found: true, confirmed: true });
          } else {
            await ref.set({
              aiMismatch: { home: lookup.home, away: lookup.away, sources: lookup.sources || [], checkedAt: now },
              needsReview: true,
              lastVerifiedAt: now,
            }, { merge: true });
            updated++;
            existingResults[m.id] = { ...existing!, aiMismatch: { home: lookup.home, away: lookup.away }, lastVerifiedAt: now };
            aiFallbackResults.push({ matchId: m.id, candidate, found: true, mismatch: true });
          }
        }
      }
    }
    const aiFallback = aiFallbackResults.length ? aiFallbackResults : null;

    /* ----- Post-match summaries + goal data (real data + AI narrative) -
     * summaryUpdates/goalsUpdates are shared with the AI-goals fallback
     * below so both write in a single Firestore call each. */
    const summaryUpdates: Record<string, any> = {};
    const goalsUpdates: Record<string, any> = {};
    let summariesGenerated = 0;

    if (hasFD && summaryCandidates.length) {
      for (const cand of summaryCandidates.slice(0, 4)) {
        let details = null;
        try {
          details = await fetchExternalMatchDetails(cand.externalId, apiKey!, baseUrl);
        } catch {
          details = null;
        }
        if (!details) continue;

        if (cand.needsGoals) {
          goalsUpdates[cand.matchId] = {
            goals: details.goals || [],
            homeCode: cand.homeCode,
            awayCode: cand.awayCode,
            updatedAt: Date.now(),
          };
        }

        if (cand.needsSummary) {
          try {
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
            // skip — retried on a later run since existingSummaries won't have it
          }
        }
      }
    }

    /* ----- AI web-search fallback for GOALS / ASSISTS -------------------
     * For finished matches still missing a live_data/match_goals entry
     * after the football-data.org pass above (no FD details available, or
     * FD not configured, or the result came from the AI result fallback),
     * ask the AI for the full goalscorer/assist breakdown. lookupGoalsViaAI
     * requires the returned goal count to exactly match the known final
     * score and returns found:false otherwise — so this never writes
     * partial/fabricated data. 0-0 matches need no lookup at all.
     * Limited to ONE AI goals lookup per run. */
    let aiGoalsFallback: any = null;
    if (process.env.ANTHROPIC_API_KEY) {
      const goalCandidates: Array<{ matchId: string; homeCode: string; awayCode: string; homeScore: number; awayScore: number; dateISO: string }> = [];

      for (const cand of summaryCandidates) {
        if (cand.needsGoals && !goalsUpdates[cand.matchId]) {
          const m = MATCHES.find(mm => mm.id === cand.matchId);
          if (m) goalCandidates.push({ matchId: cand.matchId, homeCode: cand.homeCode, awayCode: cand.awayCode, homeScore: cand.homeScore, awayScore: cand.awayScore, dateISO: m.utc });
        }
      }

      /* Also: any other finished match (e.g. result came via AI fallback,
       * or FD not configured) with a known score but no goals entry yet. */
      for (const m of MATCHES) {
        if (goalCandidates.some(g => g.matchId === m.id)) continue;
        if (goalsUpdates[m.id]) continue;
        const res = existingResults[m.id];
        if (!res || typeof res.home !== "number" || typeof res.away !== "number" || !res.finishedAt) continue;
        if (!goalsIncomplete(m.id, res.home + res.away)) continue;

        let homeCode = m.home;
        let awayCode = m.away;
        if (m.stage !== "GROUP") {
          const r = resolved[m.id];
          if (!r?.home || !r?.away) continue;
          homeCode = r.home; awayCode = r.away;
        }
        goalCandidates.push({ matchId: m.id, homeCode, awayCode, homeScore: res.home, awayScore: res.away, dateISO: m.utc });
      }

      /* Up to 3 AI lookups per run (instead of just 1): a match whose
       * goalscorers the AI can't find yet (found:false) must NOT permanently
       * block later matches in the list — previously this `break`'d after
       * the very first candidate regardless of outcome, so a single
       * stubborn match (e.g. M001) starved every match after it of goal
       * data forever. Failed lookups are simply retried on a later run. */
      const aiGoalsResults: any[] = [];
      let aiCallsUsed = 0;
      for (const gc of goalCandidates) {
        if (gc.homeScore + gc.awayScore === 0) {
          goalsUpdates[gc.matchId] = { goals: [], homeCode: gc.homeCode, awayCode: gc.awayCode, updatedAt: Date.now() };
          continue; // no AI call needed for a 0-0 — doesn't consume the per-run budget
        }

        if (aiCallsUsed >= 3) continue; // budget reached — retry the rest on a later run

        const homeName = TEAMS[gc.homeCode]?.nameEn || TEAMS[gc.homeCode]?.name || gc.homeCode;
        const awayName = TEAMS[gc.awayCode]?.nameEn || TEAMS[gc.awayCode]?.name || gc.awayCode;
        const glookup = await lookupGoalsViaAI({ homeName, awayName, dateISO: gc.dateISO, homeScore: gc.homeScore, awayScore: gc.awayScore });
        aiCallsUsed++;

        if (glookup.found && glookup.goals) {
          goalsUpdates[gc.matchId] = {
            goals: aiGoalsToExternalGoals(glookup.goals, gc.homeCode, gc.awayCode),
            homeCode: gc.homeCode,
            awayCode: gc.awayCode,
            updatedAt: Date.now(),
            source: "ai-websearch",
            aiSources: glookup.sources || [],
          };
          aiGoalsResults.push({ matchId: gc.matchId, found: true });
        } else {
          aiGoalsResults.push({ matchId: gc.matchId, found: false, reason: glookup.reason });
        }
      }
      if (aiGoalsResults.length) aiGoalsFallback = aiGoalsResults;
    }

    if (Object.keys(summaryUpdates).length) {
      await db.collection("live_data").doc("match_summaries").set(summaryUpdates, { merge: true });
    }
    if (Object.keys(goalsUpdates).length) {
      await db.collection("live_data").doc("match_goals").set(goalsUpdates, { merge: true });
    }

    /* Record that a sync actually completed — used by
     * app/api/match-results/route.ts as a cron-failure backup trigger. */
    await db.collection("live_data").doc("sync_status").set({ lastRunAt: Date.now() }, { merge: true });

    return {
      ok: true,
      inserted, updated, skipped,
      total: externalMatches.length,
      summariesGenerated,
      sources: {
        "anthropic (results)": hasAI ? "ok" : "not configured",
        "football-data.org (goals/summaries only)": hasFD ? (fdOrgError ? `error: ${fdOrgError}` : "ok") : "not configured",
      },
      aiFallback,
      aiGoalsFallback,
      ...(opts.debug ? {
        debugCandidates,
        matchResultsDocIds: existingResSnap.docs.map(d => d.id),
        debugExternalMatches: externalMatches.map((ext: any) => ({
          utcDate: ext.utcDate,
          status: ext.status,
          home: ext.homeTeam?.name,
          away: ext.awayTeam?.name,
          score: ext.score?.fullTime,
        })),
      } : {}),
    };
  } catch (e: any) {
    return { ok: false, status: 500, error: "sync_failed", message: e?.message || String(e) };
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
 * Direction-agnostic: external feed may have home/away swapped relative
 * to our scheduled order, so we accept either order. */
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

    let homeCode = m.home;
    let awayCode = m.away;
    if (m.stage !== "GROUP") {
      const r = resolved[m.id];
      if (!r || !r.home || !r.away) continue;
      homeCode = r.home;
      awayCode = r.away;
    }

    const matchDirect = nameMatches(homeCode, extHomeCode) && nameMatches(awayCode, extAwayCode);
    const matchSwap   = nameMatches(homeCode, extAwayCode) && nameMatches(awayCode, extHomeCode);
    if (matchDirect || matchSwap) return { id: m.id };
  }
  return null;
}
