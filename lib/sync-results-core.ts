import { getAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { MATCHES, TEAMS } from "@/lib/data";
import { resolveAllStages } from "@/lib/bracket";
import { teamCodeFromApiName } from "@/lib/team-name-mapper";
import type { MatchResult } from "@/lib/standings";
import { fetchExternalMatchDetails } from "@/lib/football-data-api";
import { generateMatchSummaryNarrative } from "@/lib/matchSummary";
import { lookupResultViaAI, lookupGoalsViaAI, lookupLiveScoreViaAI, aiGoalsToExternalGoals, aiGoalsToLiveGoals, type AiResultLookup } from "@/lib/ai-result-fallback";

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
 *
 * LIVE SCORE TRACKING (separate, informational-only concern): while a match
 * is in progress (kickoff <= now < kickoff + buffer, no match_results entry
 * yet), an AI lookup (lookupLiveScoreViaAI) fetches the current score +
 * goals-so-far (with minute labels) and writes them to
 * `live_data/live_scores/{matchId}`. This is a live ticker for the UI ONLY —
 * it is never read by, and never written to, match_results, so it can NEVER
 * affect prediction scoring. Once the real final result lands in
 * match_results, the live ticker entry for that match is deleted.
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
  finalCheckedAt?: number;
};

export interface SyncResult {
  ok: boolean;
  status?: number;
  [k: string]: any;
}


/* =====================================================================
 * resolveMatchTruth — deterministic Truth Engine for match score
 * resolution.  Pure function: no I/O, no side effects, fully testable.
 *
 * Called from the result loop for candidate="new" before any DB write.
 * Encapsulates all source-ranking, regression-blocking, and cross-
 * validation rules in one place so behaviour is explicit and auditable.
 *
 * ADMIN LOCK IS ABSOLUTE: if dbState.setByAdmin is true, this function
 * always returns action="SKIP" regardless of any incoming source.
 * The super-admin's manual result is the final authority — no automated
 * sync may ever override it.  This rule cannot be changed here.
 * ===================================================================*/
interface TruthResolution {
  action: "WRITE" | "DEFER" | "SKIP";
  home?: number;
  away?: number;
  /** Start verificationCount at 2 when two independent sources agree —
   *  reaches the verified:true threshold (3) in one fewer recheck cycle,
   *  locking a correct result faster. */
  initialVerificationCount: number;
  confidence: number; // 0-100, for logging/audit only
  reason: string;
}

function resolveMatchTruth(
  aiResult: { found: boolean; home?: number | null; away?: number | null } | null,
  liveAccum: { home: number; away: number } | null,
  dbState: { home?: number; away?: number; setByAdmin?: boolean; finalCheckedAt?: number } | null,
): TruthResolution {
  /* RULE 0 — ADMIN LOCK (absolute, immutable rule per product requirement):
   * A result set by the super-admin is the single source of truth.  No
   * external data, no AI output, and no automated process may ever override
   * it.  The only way to change it is another explicit admin action. */
  if (dbState?.setByAdmin) {
    return { action: "SKIP", reason: "ADMIN_LOCK", initialVerificationCount: 0, confidence: 100 };
  }

  /* RULE 1 — FINAL LOCK: once a result has completed its full verification
   * cycle (finalCheckedAt set), it is permanently immutable by automation.
   * This mirrors the candidate-selection guard in the outer loop; keeping
   * it here makes the pure function self-contained and testable. */
  if (dbState?.finalCheckedAt) {
    return { action: "SKIP", reason: "FT_FINAL_CHECKED", initialVerificationCount: 0, confidence: 100 };
  }

  /* RULE 6 — NULL / INVALID SAFETY: any null, partial, non-integer, or
   * negative score is silently ignored.  Valid DB state is never overwritten
   * by empty or malformed source data. */
  if (
    !aiResult ||
    !aiResult.found ||
    aiResult.home == null ||
    aiResult.away == null ||
    !Number.isInteger(aiResult.home) ||
    !Number.isInteger(aiResult.away) ||
    aiResult.home < 0 ||
    aiResult.away < 0
  ) {
    return { action: "DEFER", reason: "SOURCE_NULL_OR_INVALID", initialVerificationCount: 0, confidence: 0 };
  }

  const resultH = aiResult.home;
  const resultA = aiResult.away;

  /* RULE 2 — NO REGRESSION: an incoming score may never be lower than the
   * score currently stored in the DB (for either team independently).  The
   * live accumulator already enforces this at the per-observation level via
   * Math.max; this rule adds the same guarantee at the final-result write
   * level, catching cases where the AI searched too early and returned a
   * lower score than what a prior result write (or recheck) already stored.
   * Only applies when a DB result already exists (for candidate="new" with
   * no prior DB entry, dbState is null and this check is vacuously safe). */
  if (dbState && typeof dbState.home === "number" && typeof dbState.away === "number") {
    if (resultH < dbState.home || resultA < dbState.away) {
      return {
        action: "DEFER",
        reason: `REGRESSION_BLOCKED stored=${dbState.home}:${dbState.away} incoming=${resultH}:${resultA}`,
        initialVerificationCount: 0,
        confidence: 0,
      };
    }
  }

  /* RULES 4+5 — SOURCE AGREEMENT + LIVE vs FINAL RECONCILIATION:
   * The live accumulator is an independent second observation of the score:
   * it is produced by a different AI prompt (lookupLiveScoreViaAI vs
   * lookupResultViaAI), sampled at different moments throughout the match,
   * and Math.max-protected so it represents the HIGH-WATER MARK across all
   * live observations.
   *
   * Three cases when a live accumulator entry exists:
   *
   *   liveAccum > aiResult  (either team)
   *     → The result lookup hit a stale search-cache page.  The live
   *       accumulator, which has been anti-regression protected for 2+ hours,
   *       shows a higher score that the result lookup hasn't caught up to yet.
   *       DEFER — retry on the next cron run.  The result lookup will
   *       eventually converge to the correct higher score.
   *
   *   liveAccum === aiResult  (both teams exactly)
   *     → Two independent AI observations AGREE.  This is the highest
   *       confidence state the system can reach automatically.
   *       WRITE with initialVerificationCount=2 — reaches the verified:true
   *       threshold (≥3) in one fewer recheck cycle, locking the correct
   *       result ~3 minutes sooner.
   *
   *   aiResult > liveAccum  (either team)
   *     → The result lookup returned a higher score than the live tracker.
   *       This is expected for knockout matches that went to extra time or
   *       penalties: the live tracker may have stopped early or missed late
   *       goals, while the dedicated final-result prompt captures the full
   *       score.  WRITE — trust the result lookup.
   *
   * If no live accumulator exists (first cron run after buffer, or read
   * failed), fall through to the single-source path below. */
  if (liveAccum) {
    if (liveAccum.home > resultH || liveAccum.away > resultA) {
      return {
        action: "DEFER",
        reason: `LIVE_ACCUMULATED_HIGHER live=${liveAccum.home}:${liveAccum.away} result=${resultH}:${resultA}`,
        initialVerificationCount: 0,
        confidence: 0,
      };
    }
    const sourcesAgree = liveAccum.home === resultH && liveAccum.away === resultA;
    return {
      action: "WRITE",
      home: resultH,
      away: resultA,
      initialVerificationCount: sourcesAgree ? 2 : 1,
      confidence: sourcesAgree ? 80 : 60,
      reason: sourcesAgree
        ? "SOURCES_AGREE_HIGH_CONFIDENCE"
        : `RESULT_HIGHER_THAN_LIVE result=${resultH}:${resultA} live=${liveAccum.home}:${liveAccum.away}`,
    };
  }

  /* Single source only (no live accumulator available) — proceed at base
   * confidence.  The recheck cycle (~3 min, ~1h) provides eventual
   * confirmation and corrects any wrong first-run response. */
  return {
    action: "WRITE",
    home: resultH,
    away: resultA,
    initialVerificationCount: 1,
    confidence: 50,
    reason: "AI_RESULT_NO_LIVE_CROSS_CHECK",
  };
}

export async function runResultsSync(opts: { force?: boolean; debug?: boolean } = {}): Promise<SyncResult> {
  console.log(`[sync] runResultsSync start force=${!!opts.force} debug=${!!opts.debug}`);
  const apiKey = process.env.FOOTBALL_API_KEY;
  const hasFD = !!apiKey;
  const hasTsdb = !!process.env.THESPORTSDB_API_KEY;

  if (!hasFD) {
    return {
      ok: true,
      skipped: "no result source configured",
      docs: "Set FOOTBALL_API_KEY in Vercel env vars — it is the source for match_results via football-data.org.",
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
        finalCheckedAt: data.finalCheckedAt || 0,
      };
    });
    const resolved = resolveAllStages(existingResults);

    /* Pre-fetch the live scores document BEFORE the result loop so the
     * reconciliation layer in the result loop can cross-validate each
     * AI result lookup against the accumulated live score for the same
     * match.  This is the same single Firestore read that was previously
     * only done inside the live tracking section; hoisting it here gives
     * both loops access without an extra round-trip. */
    let existingLiveScores: Record<string, any> = {};
    try {
      const liveSnap = await db.collection("live_data").doc("live_scores").get();
      if (liveSnap.exists) existingLiveScores = liveSnap.data() ?? {};
    } catch { /* read error — proceed without cross-validation for this run */ }

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

    /* Hoisted so the LIVE SCORE TRACKING section below (and the result
     * fallback section) share the same "now" + buffer definitions. */
    const now = Date.now();
    const GROUP_BUFFER_MS = 120 * 60 * 1000; // ~2h: regulation + halftime + stoppage time
    const KO_BUFFER_MS = 185 * 60 * 1000;    // ~3h05m: regulation + ET + penalties, worst case

    if (hasFD) {
      /* IMPORTANT: this `buffer` is a pre-filter to avoid querying for a
       * result before the match has REALISTICALLY ended — including halftime
       * break + stoppage time for regulation matches, and (for knockout
       * matches) extra time + penalties on top of that. Conservative
       * real-world estimates of "kickoff to final whistle":
       *   - Group/regulation: 90 min play + ~15 min halftime + ~15 min
       *     stoppage/added time  -> ~120 min.
       *   - Knockout: regulation (~120 min incl. halftime+stoppage) + ~15
       *     min break before extra time + 30 min extra time + up to ~20
       *     min for a penalty shootout -> ~185 min.
       *
       * After the buffer, lookupResultViaAI() (which now calls
       * football-data.org directly) returns found:false until the API
       * reports FINISHED status. We retry every cron minute until true. */
      const RECHECK_MS = 3 * 60 * 1000;
      /* Final correction pass: ~1h after a result was first written, do ONE
       * more lookup and, if it disagrees with what's stored — for ANY
       * reason, including a result that was already "verified" via the
       * 3x same-score recheck above, or one already flagged aiMismatch —
       * OVERWRITE it with the (by-now more reliable) AI-sourced score. This
       * is the user-requested final accuracy check: by an hour after the
       * result first appeared, enough sources have caught up that we trust
       * a fresh lookup enough to actively correct a wrong entry, not just
       * flag it for manual review. Runs once per match (finalCheckedAt). */
      const FINAL_CHECK_MS = 60 * 60 * 1000;

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
        if (existing?.setByAdmin) {
          console.log(`[sync-result] ${m.id} skipped — setByAdmin lock, stored=${existing.home}:${existing.away}`);
          continue;
        }

        let candidate: "new" | "recheck" | "finalCheck" | null = null;
        if (!existing) candidate = "new";
        else if (
          existing.source === "football-data.org" &&
          !existing.aiMismatch &&
          (existing.verificationCount || 0) < 3 &&
          now - (existing.lastVerifiedAt || 0) >= RECHECK_MS
        ) candidate = "recheck";
        else if (
          existing.source === "football-data.org" &&
          !existing.finalCheckedAt &&
          now - (existing.finishedAt || 0) >= FINAL_CHECK_MS
        ) candidate = "finalCheck";

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
            lookup = await lookupResultViaAI({ homeCode, awayCode, dateISO: m.utc, isKnockout: true });
          } else {
            /* Unresolved bracket slot — look up by stage + date; football-data.org
             * already knows the two teams once the prior round is done. */
            const idLookup = await lookupResultViaAI({ stageLabel: m.stage, dateISO: m.utc, isKnockout: true });
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
          lookup = await lookupResultViaAI({ homeCode, awayCode, dateISO: m.utc, isKnockout: false });
        }
        resultCallsUsed++;

        if (!lookup.found || lookup.home == null || lookup.away == null || !homeCode || !awayCode) {
          const reason = lookup.reason || (!homeCode || !awayCode ? "missing_team_code" : "found_false");
          console.log(`[sync-result] ${m.id} candidate=${candidate} found=false reason=${reason}`);
          aiFallbackResults.push({ matchId: m.id, candidate, found: false, reason: lookup.reason || (!homeCode || !awayCode ? "missing_team_code" : undefined) });
          continue; // try other matches this run too — retried on a later run
        }

        console.log(`[sync-result] ${m.id} candidate=${candidate} provider=ai-websearch score=${lookup.home}:${lookup.away} prev=${existing ? `${existing.home}:${existing.away}` : "none"}`);

        const ref = db.collection("match_results").doc(m.id);
        if (candidate === "new") {
          const doc: any = {
            matchId: m.id,
            home: lookup.home,
            away: lookup.away,
            finishedAt: now,
            sim: false,
            source: "football-data.org",
            apiSources: lookup.sources || [],
            verificationCount: 1,
            lastVerifiedAt: now,
            ...(isKO ? { isKnockout: true } : {}),
          };
          if (isKO && lookup.winnerSide && lookup.winnerSide !== "DRAW") {
            if (lookup.winnerSide === "HOME") doc.winner = homeCode;
            else if (lookup.winnerSide === "AWAY") doc.winner = awayCode;
          }
          /* Truth Engine — deterministic reconciliation of all score sources.
           * Replaces the previous inline cross-validation block.  The pure
           * function enforces: admin lock, FT lock, null safety, no
           * regression, source agreement bonus, and live/final staleness
           * detection — in that fixed priority order, every run. */
          const liveEntry = existingLiveScores[m.id];
          const liveAccumForEngine = (liveEntry && typeof liveEntry.home === "number" && typeof liveEntry.away === "number")
            ? { home: liveEntry.home as number, away: liveEntry.away as number }
            : null;
          const resolution = resolveMatchTruth(lookup, liveAccumForEngine, null);
          console.log(`[sync-result] ${m.id} truth-engine action=${resolution.action} confidence=${resolution.confidence} reason=${resolution.reason}`);
          if (resolution.action !== "WRITE") {
            if (resolution.action === "DEFER") resultCallsUsed--; // don't penalise budget for deferred run
            aiFallbackResults.push({ matchId: m.id, candidate, found: true, written: false, reason: resolution.reason });
            continue;
          }
          // Use engine's initialVerificationCount — 2 when two sources agree (high confidence)
          doc.verificationCount = resolution.initialVerificationCount;


          /* Atomic conditional write — only creates the document if it does
           * not already exist at write time.  Two concurrent cron jobs can
           * both reach this point with different AI responses (different
           * search-cache hits); without a transaction, the last writer would
           * win and potentially overwrite a correct score with a wrong one.
           * The transaction guarantees exactly-once creation: whichever cron
           * commits first wins; the second sees an existing doc and aborts
           * silently — it will be picked up on its next run as "recheck". */
          let written = false;
          await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (snap.exists) {
              console.log(`[sync-result] ${m.id} race: result already written by concurrent job (stored=${snap.data()?.home}:${snap.data()?.away}), skipping`);
              return;
            }
            tx.set(ref, doc);
            written = true;
          });
          if (written) {
            inserted++;
            existingResults[m.id] = {
              home: doc.home, away: doc.away, finishedAt: doc.finishedAt, winner: doc.winner,
              source: doc.source, verificationCount: doc.verificationCount, lastVerifiedAt: doc.lastVerifiedAt,
            } as StoredResult;
            console.log(`[sync-result] ${m.id} WRITTEN new result ${lookup.home}:${lookup.away} winner=${doc.winner ?? "n/a"} sources=${(lookup.sources || []).slice(0, 2).join(", ")}`);
            aiFallbackResults.push({ matchId: m.id, candidate, found: true, written: true });
          } else {
            aiFallbackResults.push({ matchId: m.id, candidate, found: true, written: false, reason: "race_concurrent_write" });
          }
          /* Keep live_data/live_scores entry so finished match cards can
           * still display goal scorers. The UI ignores the live score
           * once match_results is written (isFinished=true takes precedence). */
        } else if (candidate === "recheck") {
          const sameScore = existing!.home === lookup.home && existing!.away === lookup.away;
          if (sameScore) {
            const newCount = (existing!.verificationCount || 0) + 1;
            const update: any = { verificationCount: newCount, lastVerifiedAt: now };
            if (newCount >= 3) update.verified = true;
            await ref.set(update, { merge: true });
            updated++;
            existingResults[m.id] = { ...existing!, verificationCount: newCount, lastVerifiedAt: now };
            console.log(`[sync-result] ${m.id} recheck confirmed ${existing!.home}:${existing!.away} verificationCount=${newCount}`);
            aiFallbackResults.push({ matchId: m.id, candidate, found: true, confirmed: true });
          } else {
            await ref.set({
              aiMismatch: { home: lookup.home, away: lookup.away, sources: lookup.sources || [], checkedAt: now },
              needsReview: true,
              lastVerifiedAt: now,
            }, { merge: true });
            updated++;
            existingResults[m.id] = { ...existing!, aiMismatch: { home: lookup.home, away: lookup.away }, lastVerifiedAt: now };
            console.log(`[sync-result] ${m.id} recheck MISMATCH stored=${existing!.home}:${existing!.away} ai=${lookup.home}:${lookup.away} — flagged needsReview`);
            aiFallbackResults.push({ matchId: m.id, candidate, found: true, mismatch: true });
          }
        } else {
          /* finalCheck — ~1h after the result first appeared, this is the
           * user-requested final accuracy pass: if the fresh AI lookup
           * agrees with what's stored, just mark it checked. If it
           * DISAGREES — even if the prior result was already "verified" or
           * flagged aiMismatch — OVERWRITE home/away/winner with the new
           * (more reliable, by now) score. The previous value is kept in
           * correctedFrom for an audit trail. Runs once per match. */
          const sameScore = existing!.home === lookup.home && existing!.away === lookup.away;
          if (sameScore) {
            await ref.set({
              finalCheckedAt: now,
              ...(existing!.aiMismatch ? { aiMismatch: null, needsReview: false } : {}),
            }, { merge: true });
            updated++;
            existingResults[m.id] = { ...existing!, finalCheckedAt: now, aiMismatch: undefined };
            console.log(`[sync-result] ${m.id} finalCheck confirmed ${existing!.home}:${existing!.away} — result locked`);
            aiFallbackResults.push({ matchId: m.id, candidate, found: true, confirmed: true });
          } else {
            /* REGRESSION CHECK before finalCheck correction: never allow
             * the 1h correction pass to write a score lower than what is
             * already stored (admin lock is checked first in the outer guard;
             * this catches AI stale responses at the correction stage). */
            if (
              typeof lookup.home === "number" && typeof lookup.away === "number" &&
              (lookup.home < existing!.home || lookup.away < existing!.away)
            ) {
              console.log(`[sync-result] ${m.id} finalCheck regression blocked: stored=${existing!.home}:${existing!.away} ai=${lookup.home}:${lookup.away} — deferring correction`);
              aiFallbackResults.push({ matchId: m.id, candidate, found: true, corrected: false, reason: `finalCheck_regression_blocked stored=${existing!.home}:${existing!.away} ai=${lookup.home}:${lookup.away}` });
            } else {
              const correction: any = {
                home: lookup.home,
                away: lookup.away,
                source: "ai-websearch",
                aiSources: lookup.sources || [],
                verificationCount: 1,
                lastVerifiedAt: now,
                finalCheckedAt: now,
                verified: true,
                correctedAt: now,
                correctedFrom: { home: existing!.home, away: existing!.away },
                aiMismatch: null,
                needsReview: false,
              };
              if (isKO) {
                if (lookup.winnerSide === "HOME" && homeCode) correction.winner = homeCode;
                else if (lookup.winnerSide === "AWAY" && awayCode) correction.winner = awayCode;
                else correction.winner = null;
              }
              /* Atomic correction write — prevents two concurrent crons that
               * both reach finalCheck from writing different AI responses.
               * The transaction re-reads the document: if finalCheckedAt is
               * already set (written by the concurrent job) or if setByAdmin
               * was set between our read and write, this job aborts safely. */
              let corrected = false;
              await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists) {
                  console.log(`[sync-result] ${m.id} finalCheck correction aborted — doc missing`);
                  return;
                }
                const live = snap.data() as any;
                if (live.setByAdmin) {
                  console.log(`[sync-result] ${m.id} finalCheck correction aborted — setByAdmin set between read and write`);
                  return;
                }
                if (live.finalCheckedAt) {
                  console.log(`[sync-result] ${m.id} finalCheck correction aborted — already finalized by concurrent job (stored=${live.home}:${live.away})`);
                  return;
                }
                tx.set(ref, correction, { merge: true });
                corrected = true;
              });
              if (corrected) {
                updated++;
                existingResults[m.id] = {
                  ...existing!, home: lookup.home, away: lookup.away,
                  winner: correction.winner ?? existing!.winner,
                  source: "ai-websearch", verificationCount: 1, lastVerifiedAt: now,
                  finalCheckedAt: now, aiMismatch: undefined,
                };
                console.log(`[sync-result] ${m.id} finalCheck CORRECTED ${existing!.home}:${existing!.away} → ${lookup.home}:${lookup.away}`);
                aiFallbackResults.push({ matchId: m.id, candidate, found: true, corrected: true, from: { home: existing!.home, away: existing!.away }, to: { home: lookup.home, away: lookup.away } });
              } else {
                aiFallbackResults.push({ matchId: m.id, candidate, found: true, corrected: false, reason: "race_or_guard_blocked" });
              }
            }
          }
        }
      }
    }
    const aiFallback = aiFallbackResults.length ? aiFallbackResults : null;

    /* ----- LIVE SCORE TRACKING (informational only — NEVER affects
     * match_results / prediction scoring) ---------------------------------
     * While a match is presumed to be in progress (kickoff has passed but
     * the GROUP_BUFFER_MS/KO_BUFFER_MS "has it really ended" buffer hasn't,
     * AND no match_results entry exists yet), ask the AI for the CURRENT
     * live score + the list of goals scored so far via
     * lookupLiveScoreViaAI. Written to live_data/live_scores/{matchId} —
     * a separate doc from match_results, polled by the client for a live
     * ticker. The user's guesses are scored ONLY once the AI result
     * fallback above writes the real, final match_results entry (per the
     * RESULT POLICY at the top of this file) — this section never writes
     * there.
     *
     * Small, separate budget (per run) so live ticking for one match can't
     * starve the result/goals AI calls above. */
    const LIVE_FALLBACK_BUDGET = 2;
    let liveCallsUsed = 0;
    const liveUpdates: Record<string, any> = {};
    const liveFallback: any[] = [];
    if (hasFD) {
      /* existingLiveScores was pre-fetched above (before the result loop)
       * so both loops share the same snapshot without an extra read. */

      function mergeGoals(
        existing: Array<{ minute?: number | null; team?: string; player?: string; assist?: string; type?: string }>,
        incoming: Array<{ minute?: number | null; team?: string; player?: string; assist?: string; type?: string }>,
      ) {
        const merged = [...existing];
        for (const g of incoming) {
          const dup = merged.some(e =>
            e.player === g.player && e.team === g.team &&
            (e.minute == null ? g.minute == null : e.minute === g.minute)
          );
          if (!dup) merged.push(g);
        }
        return merged.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
      }

      for (const m of MATCHES) {
        const isKO = m.stage !== "GROUP";
        const kickoff = new Date(m.utc).getTime();
        const buffer = isKO ? KO_BUFFER_MS : GROUP_BUFFER_MS;

        // Only while presumed in-progress: kickoff has passed, the "has it
        // really ended" buffer hasn't, and we don't have a final result yet.
        if (now < kickoff || now >= kickoff + buffer) continue;
        if (existingResults[m.id]) continue;

        let homeCode: string | undefined = m.home;
        let awayCode: string | undefined = m.away;
        if (isKO) {
          const r = resolved[m.id];
          if (!r?.home || !r?.away) continue; // unresolved bracket slot — nothing to track yet
          homeCode = r.home; awayCode = r.away;
        }
        if (!homeCode || !awayCode) continue;

        if (liveCallsUsed >= LIVE_FALLBACK_BUDGET) continue; // retry on a later run

        const live = await lookupLiveScoreViaAI({ homeName: homeCode, awayName: awayCode, homeCode, awayCode, dateISO: m.utc, isKnockout: isKO });
        liveCallsUsed++;

        if (live.found && live.home != null && live.away != null) {
          const newGoals = aiGoalsToLiveGoals(live.goals || []);
          const prevGoals: any[] = existingLiveScores[m.id]?.goals ?? [];
          const mergedGoals = mergeGoals(prevGoals, newGoals);

          /* Never reduce a live score — the AI may return a stale cached
           * result from a search engine that hasn't updated yet.  We keep
           * whichever score is higher for each side independently.
           * minuteLabel is accepted from the AI only when its numeric score
           * is at least as high as what we already have (i.e. the feed is
           * at least as current); otherwise we keep the stored label so the
           * clock stays consistent with the higher score we're preserving. */
          const prevHome: number = existingLiveScores[m.id]?.home ?? 0;
          const prevAway: number = existingLiveScores[m.id]?.away ?? 0;
          const safeHome = Math.max(live.home, prevHome);
          const safeAway = Math.max(live.away, prevAway);
          const scoreAdvanced = live.home >= prevHome && live.away >= prevAway;
          const safeMinuteLabel = scoreAdvanced
            ? (live.minuteLabel || null)
            : (existingLiveScores[m.id]?.minuteLabel ?? null);

          if (!scoreAdvanced) {
            console.log(`[sync-live] ${m.id} score regression blocked: api=${live.home}:${live.away} stored=${prevHome}:${prevAway} — keeping stored score, keeping stored minuteLabel`);
          }

          liveUpdates[m.id] = {
            home: safeHome,
            away: safeAway,
            minuteLabel: safeMinuteLabel,
            goals: mergedGoals,
            homeCode,
            awayCode,
            updatedAt: now,
            sources: live.sources || [],
          };
          console.log(`[sync-live] ${m.id} ${homeCode} vs ${awayCode}: score=${safeHome}:${safeAway} label=${safeMinuteLabel} goals=${mergedGoals.length}`);
          liveFallback.push({ matchId: m.id, found: true, score: `${safeHome}:${safeAway}`, minuteLabel: safeMinuteLabel, goals: mergedGoals.length });
        } else {
          console.log(`[sync-live] ${m.id} ${homeCode} vs ${awayCode}: found=false reason=${live.reason ?? "unknown"}`);
          liveFallback.push({ matchId: m.id, found: false, reason: live.reason });
        }
      }
      if (Object.keys(liveUpdates).length) {
        await db.collection("live_data").doc("live_scores").set(liveUpdates, { merge: true });
      }
    }

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
       * block later matches in the list. Failed lookups are simply retried
       * on a later run. */
      const aiGoalsResults: any[] = [];
      let aiCallsUsed = 0;
      for (const gc of goalCandidates) {
        if (gc.homeScore + gc.awayScore === 0) {
          goalsUpdates[gc.matchId] = { goals: [], homeCode: gc.homeCode, awayCode: gc.awayCode, updatedAt: Date.now() };
          continue; // no AI call needed for a 0-0 — doesn't consume the per-run budget
        }

        if (aiCallsUsed >= 5) continue; // budget reached — retry the rest on a later run

        const glookup = await lookupGoalsViaAI({ homeName: gc.homeCode, awayName: gc.awayCode, homeCode: gc.homeCode, awayCode: gc.awayCode, dateISO: gc.dateISO, homeScore: gc.homeScore, awayScore: gc.awayScore });
        aiCallsUsed++;

        if (glookup.found && glookup.goals) {
          goalsUpdates[gc.matchId] = {
            goals: aiGoalsToExternalGoals(glookup.goals, gc.homeCode, gc.awayCode),
            homeCode: gc.homeCode,
            awayCode: gc.awayCode,
            updatedAt: Date.now(),
            source: "football-data.org",
            apiSources: glookup.sources || [],
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
        "thesportsdb (results/live)": hasTsdb ? "ok" : "not configured",
        "football-data.org (goals/summaries only)": hasFD ? (fdOrgError ? `error: ${fdOrgError}` : "ok") : "not configured",
      },
      aiFallback,
      aiGoalsFallback,
      liveFallback: liveFallback.length ? liveFallback : null,
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
