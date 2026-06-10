import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebase-admin";
import { fetchLiveWcSquads } from "@/lib/football-data-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================================
 * GET /api/squads
 *
 * Returns live WC2026 squads + coaches for the 35 teams without
 * hand-curated Hebrew data, pulled from football-data.org and cached in
 * Firestore (`live_data/squads`) so we don't hammer the API on every
 * page load. The cron at /api/cron/sync-squads refreshes this cache
 * daily; this route also opportunistically refreshes it if the cache is
 * stale or missing.
 *
 * Live players are also enriched with jersey number + current club from
 * `live_data/player_details` (populated gradually by
 * /api/cron/sync-player-details), so the squad UI can show "#7 · Club"
 * for every player, not just the hand-curated stars.
 *
 * Response: { squads: Record<code, Player[]>, coaches: Record<code, Coach>,
 *             cachedAt: number | null, source: "cache" | "live" | "empty" }
 * ===================================================================*/

const TTL_MS = 12 * 60 * 60 * 1000; // 12h

/* Merge cached jersey/club enrichment (from /api/cron/sync-player-details)
 * into the live squad players. Only touches players flagged `live: true`;
 * hand-curated players already carry their own jersey + club. */
async function withPlayerDetails(db: Firestore, squads: Record<string, any[]>): Promise<Record<string, any[]>> {
  try {
    const snap = await db.collection("live_data").doc("player_details").get();
    const details: Record<string, { shirtNumber?: number; club?: string }> =
      (snap.exists ? (snap.data() as any)?.players : null) || {};
    if (!Object.keys(details).length) return squads;

    const out: Record<string, any[]> = {};
    for (const code of Object.keys(squads)) {
      out[code] = (squads[code] || []).map((p: any) => {
        if (!p?.live) return p;
        const d = details[p.id];
        if (!d) return p;
        return {
          ...p,
          jersey: d.shirtNumber ?? p.jersey,
          club: d.club ?? p.club,
        };
      });
    }
    return out;
  } catch {
    return squads;
  }
}

export async function GET() {
  try {
    const { db } = getAdmin();
    const ref = db.collection("live_data").doc("squads");
    const snap = await ref.get();
    const cached = snap.exists ? (snap.data() as any) : null;

    const fresh = cached && cached.cachedAt && (Date.now() - cached.cachedAt) < TTL_MS;
    if (fresh) {
      return NextResponse.json({
        squads: await withPlayerDetails(db, cached.squads || {}),
        coaches: cached.coaches || {},
        cachedAt: cached.cachedAt,
        source: "cache",
      });
    }

    const live = await fetchLiveWcSquads();
    if (live) {
      const cachedAt = Date.now();
      await ref.set({ ...live, cachedAt }, { merge: true });
      return NextResponse.json({
        squads: await withPlayerDetails(db, live.squads || {}),
        coaches: live.coaches || {},
        cachedAt,
        source: "live",
      });
    }

    /* Live fetch failed (no key / network) — serve stale cache if we have one. */
    if (cached) {
      return NextResponse.json({
        squads: await withPlayerDetails(db, cached.squads || {}),
        coaches: cached.coaches || {},
        cachedAt: cached.cachedAt,
        source: "cache",
      });
    }

    return NextResponse.json({ squads: {}, coaches: {}, cachedAt: null, source: "empty" });
  } catch (e: any) {
    return NextResponse.json({ squads: {}, coaches: {}, cachedAt: null, source: "empty", error: e?.message || String(e) });
  }
}
