import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { fetchLiveWcSquads } from "@/lib/football-data-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* =====================================================================
 * GET /api/cron/sync-squads
 *
 * Daily refresh of the live squads/coaches cache (`live_data/squads`)
 * from football-data.org. Keeps `/api/squads` fast and within the API's
 * rate limits. If FOOTBALL_API_KEY is not set, this is a no-op.
 * ===================================================================*/

const SECRET = process.env.CRON_SECRET || "";

export async function GET(req: Request) {
  if (SECRET) {
    const auth = req.headers.get("authorization") || "";
    if (!auth.endsWith(SECRET)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const live = await fetchLiveWcSquads();
  if (!live) {
    return NextResponse.json({ ok: true, skipped: "FOOTBALL_API_KEY not configured or fetch failed" });
  }

  const { db } = getAdmin();
  const cachedAt = Date.now();
  await db.collection("live_data").doc("squads").set({ ...live, cachedAt }, { merge: true });

  return NextResponse.json({
    ok: true,
    teams: Object.keys(live.squads).length,
    coaches: Object.keys(live.coaches).length,
    cachedAt,
  });
}
