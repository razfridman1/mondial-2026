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
 * Timing: runs hourly. For each match that doesn't have a cached
 * preview yet:
 *   - "day before" window: kickoff is between 12h and 36h away → generate.
 *   - fallback window: kickoff is within the next 6h and STILL no
 *     preview (e.g. a knockout matchup that only got resolved late) →
 *     generate.
 * Only matches whose teams are already known (not placeholders) are
 * eligible. Processes at most MAX_PER_RUN matches per invocation to
 * stay within the function timeout (each one may call ESPN + the AI).
 *
 * Configuration: CRON_SECRET (optional, same as other crons),
 * ANTHROPIC_API_KEY (optional — without it, a plain factual fallback
 * text is cached instead of an AI narrative).
 * ===================================================================*/

const SECRET = process.env.CRON_SECRET || "";
const MAX_PER_RUN = 3;
const DAY_BEFORE_MIN_MS = 12 * 60 * 60 * 1000;
const DAY_BEFORE_MAX_MS = 36 * 60 * 60 * 1000;
const FALLBACK_MAX_MS = 6 * 60 * 60 * 1000;

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
      const existing = existingPreviews[m.id];
      /* Regenerate if a preview was already cached for this matchId but for
       * DIFFERENT teams than are currently resolved (e.g. the bracket slot
       * got re-resolved after a result correction upstream) — otherwise a
       * stale preview about the wrong teams would keep showing forever. */
      if (existing && existing.home === m.home && existing.away === m.away) return false;
      if (matchLiveStatus(m) === "live" || matchLiveStatus(m) === "finished") return false;
      if (m.homeIsPlaceholder || m.awayIsPlaceholder) return false;
      const diff = new Date(m.utc).getTime() - now;
      if (diff < 0) return false;
      const inDayBefore = diff >= DAY_BEFORE_MIN_MS && diff <= DAY_BEFORE_MAX_MS;
      const inFallback = diff <= FALLBACK_MAX_MS;
      return inDayBefore || inFallback;
    })
    .sort((a, b) => new Date(a.utc).getTime() - new Date(b.utc).getTime())
    .slice(0, MAX_PER_RUN);

  let generated = 0;
  const updates: Record<string, any> = {};

  for (const match of candidates) {
    try {
      const ctx = await gatherMatchPreviewContext(match, results);
      if (!ctx) continue;
      const text = await generatePreviewNarrative(ctx);
      if (!text) continue;
      updates[match.id] = { text, generatedAt: Date.now(), matchUtc: match.utc, home: match.home, away: match.away };
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
