import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import { applyOverride, matchLiveStatus } from "@/lib/utils";
import { resolveAllStages } from "@/lib/bracket";
import { gatherMatchPreviewContext, generatePreviewNarrative } from "@/lib/matchPreview";
import type { MatchResult } from "@/lib/standings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* =====================================================================
 * GET /api/cron/sync-match-previews
 *
 * Generates AI Hebrew "match preview" text for upcoming matches and
 * caches it in Firestore (live_data/match_previews/{matchId}). The UI
 * (MatchModal) reads the cache via /api/match-previews — this cron is
 * the only thing that calls the AI.
 *
 * Timing: runs hourly. For each match:
 *   - never generated yet → "day before" window: kickoff is between 12h
 *     and 36h away → generate. Fallback window: kickoff is within the
 *     next 6h and STILL no preview (e.g. a knockout matchup that only
 *     got resolved late) → generate.
 *   - already generated but for DIFFERENT teams than are currently
 *     resolved (a bracket slot got re-resolved, e.g. after a result
 *     correction) → regenerate immediately, ignoring the timing windows
 *     above, since the cached text is actively wrong and MatchModal
 *     hides it client-side until it's fixed.
 * Only matches whose teams are already known (not placeholders) are
 * eligible. Processes at most MAX_PER_RUN matches per invocation
 * (stale/wrong ones first) to stay within the function timeout (each
 * one may call ESPN + the AI).
 *
 * Configuration: CRON_SECRET (optional, same as other crons),
 * ANTHROPIC_API_KEY (optional — without it, a plain factual fallback
 * text is cached instead of an AI narrative).
 * ===================================================================*/

const SECRET = process.env.CRON_SECRET || "";
const MAX_PER_RUN = 5;
const DAY_BEFORE_MIN_MS = 12 * 60 * 60 * 1000;
const DAY_BEFORE_MAX_MS = 36 * 60 * 60 * 1000;
const FALLBACK_MAX_MS = 6 * 60 * 60 * 1000;
/* Bump whenever the preview-generation logic changes in a way that could
 * make previously-cached text wrong. v2 tightened the ESPN relevance
 * filter; v3 removed ESPN news from the prompt entirely (it kept leaking
 * irrelevant player/team storylines — e.g. a Ronaldo/Messi tangent inside
 * a Portugal vs Spain preview — even after the v2 filter), and forbade
 * markdown formatting in the output. Any cached entry without a matching
 * version is treated as stale and gets regenerated once, even if its
 * recorded teams are still correct. */
const PREVIEW_VERSION = 3;

export async function GET(req: Request) {
  if (SECRET) {
    const auth = req.headers.get("authorization") || "";
    if (!auth.endsWith(SECRET)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const { db } = getAdmin();

  const [ovSnap, resSnap, prevSnap] = await Promise.all([
    db.collection("broadcast_overrides").get(),
    db.collection("match_results").get(),
    db.collection("live_data").doc("match_previews").get(),
  ]);

  const overrides: Record<string, any> = {};
  ovSnap.forEach(d => { overrides[d.id] = d.data(); });

  const results: Record<string, MatchResult> = {};
  resSnap.forEach(d => {
    const data = d.data() as any;
    results[d.id] = { home: data.home, away: data.away, finishedAt: data.finishedAt || 0 };
  });

  const existingPreviews: Record<string, any> = prevSnap.exists ? (prevSnap.data() || {}) : {};

  /* Resolve knockout placeholders ("W R32-9" etc.) to the actual teams that
   * qualified, using the live results — without this, `TEAMS[match.home]`
   * lookups in gatherMatchPreviewContext always fail for KO-stage matches
   * and no preview is ever generated for them. */
  const resolved = resolveAllStages(results);

  const now = Date.now();
  const candidates = MATCHES
    .map(mt => {
      const withOverride = applyOverride(mt, overrides[mt.id]);
      if (mt.stage === "GROUP") return withOverride;
      const r = resolved[mt.id];
      return {
        ...withOverride,
        home: r?.home || withOverride.home,
        away: r?.away || withOverride.away,
        homeIsPlaceholder: !r?.home,
        awayIsPlaceholder: !r?.away,
      };
    })
    .filter(m => {
      if (matchLiveStatus(m) === "live" || matchLiveStatus(m) === "finished") return false;
      if (m.homeIsPlaceholder || m.awayIsPlaceholder) return false;
      const diff = new Date(m.utc).getTime() - now;
      if (diff < 0) return false;

      const existing = existingPreviews[m.id];
      const isStale = !!existing && (
        existing.home !== m.home ||
        existing.away !== m.away ||
        existing.version !== PREVIEW_VERSION
      );
      /* Already cached for the CURRENT teams — nothing to do. */
      if (existing && !isStale) return false;
      /* Stale (cached for different teams, e.g. re-resolved after a result
       * correction upstream, or cached before we tracked home/away at all) —
       * fix it right away regardless of the day-before/fallback timing
       * windows below, so a wrong preview doesn't keep showing. */
      if (isStale) return true;

      const inDayBefore = diff >= DAY_BEFORE_MIN_MS && diff <= DAY_BEFORE_MAX_MS;
      const inFallback = diff <= FALLBACK_MAX_MS;
      return inDayBefore || inFallback;
    })
    .sort((a, b) => {
      /* Fixing a wrong/stale preview takes priority over generating a
       * brand-new one, since the wrong one is actively visible to users. */
      const aStale = existingPreviews[a.id] ? 1 : 0;
      const bStale = existingPreviews[b.id] ? 1 : 0;
      if (aStale !== bStale) return bStale - aStale;
      return new Date(a.utc).getTime() - new Date(b.utc).getTime();
    })
    .slice(0, MAX_PER_RUN);

  let generated = 0;
  const updates: Record<string, any> = {};

  for (const match of candidates) {
    try {
      const ctx = await gatherMatchPreviewContext(match, results);
      if (!ctx) continue;
      const text = await generatePreviewNarrative(ctx);
      if (!text) continue;
      updates[match.id] = {
        text, generatedAt: Date.now(), matchUtc: match.utc,
        home: match.home, away: match.away, version: PREVIEW_VERSION,
      };
      generated++;
    } catch {
      // skip this match, try again next run
    }
  }

  if (Object.keys(updates).length) {
    await db.collection("live_data").doc("match_previews").set(updates, { merge: true });
  }

  return NextResponse.json({ ok: true, candidates: candidates.length, generated });
}
