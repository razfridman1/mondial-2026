import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { fetchPersonDetails } from "@/lib/football-data-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* =====================================================================
 * GET /api/cron/sync-player-details
 *
 * Gradually enriches the live WC2026 squads (cached at
 * `live_data/squads`, refreshed by /api/cron/sync-squads) with each
 * player's shirt number + current club, pulled one-by-one from
 * football-data.org's `/persons/{id}` endpoint.
 *
 * Runs every minute, processing a small batch each time to stay well
 * within football-data.org's free-tier limit of 10 requests/minute
 * (shared with /api/cron/sync-results during live matches). Results
 * are cached in `live_data/player_details` (keyed by our internal
 * player id, e.g. "BEL_98765") and re-checked every REFRESH_MS so
 * transfers/squad changes eventually propagate.
 *
 * /api/squads merges this cache into the live squads it returns.
 * If FOOTBALL_API_KEY is not set, this is a no-op.
 * ===================================================================*/

const SECRET = process.env.CRON_SECRET || "";
const BATCH_SIZE = 6; // stay under football-data.org's 10 req/min free-tier cap
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000; // re-check each player every ~30 days

export async function GET(req: Request) {
  if (SECRET) {
    const auth = req.headers.get("authorization") || "";
    if (!auth.endsWith(SECRET)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: true, skipped: "FOOTBALL_API_KEY not configured" });
  }
  const baseUrl = process.env.FOOTBALL_API_URL || "https://api.football-data.org/v4";

  try {
    const { db } = getAdmin();

    const squadsSnap = await db.collection("live_data").doc("squads").get();
    const squads: Record<string, any[]> = (squadsSnap.exists ? (squadsSnap.data() as any)?.squads : null) || {};

    const detailsRef = db.collection("live_data").doc("player_details");
    const detailsSnap = await detailsRef.get();
    const details: Record<string, { shirtNumber?: number; club?: string; fetchedAt: number }> =
      (detailsSnap.exists ? (detailsSnap.data() as any)?.players : null) || {};

    const now = Date.now();

    /* Build the queue of players that need a (re-)fetch. Only "live"
     * (football-data) players have a numeric trailing id we can query —
     * curated/hand-written players already carry jersey + club. */
    const candidates: { id: string; personId: string }[] = [];
    for (const code of Object.keys(squads)) {
      for (const p of squads[code] || []) {
        if (!p?.id || !p.live) continue;
        const existing = details[p.id];
        if (existing && now - existing.fetchedAt < REFRESH_MS) continue;
        const personId = String(p.id).split("_").pop();
        if (!personId || !/^\d+$/.test(personId)) continue;
        candidates.push({ id: p.id, personId });
      }
    }

    if (!candidates.length) {
      return NextResponse.json({ ok: true, done: true, cached: Object.keys(details).length });
    }

    const batch = candidates.slice(0, BATCH_SIZE);
    let updated = 0;
    for (const c of batch) {
      const info = await fetchPersonDetails(c.personId, apiKey, baseUrl);
      details[c.id] = { ...(info || {}), fetchedAt: now };
      if (info && (info.shirtNumber != null || info.club)) updated++;
    }

    await detailsRef.set({ players: details, updatedAt: now }, { merge: true });

    return NextResponse.json({
      ok: true,
      processed: batch.length,
      updated,
      remaining: candidates.length - batch.length,
      cached: Object.keys(details).length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "sync_failed", message: e?.message || String(e) }, { status: 500 });
  }
}
