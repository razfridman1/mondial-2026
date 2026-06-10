import { NextResponse } from "next/server";
import { MATCHES } from "@/lib/data";
import { buildMatchLineups } from "@/lib/lineups";
import { fetchLiveLineups } from "@/lib/lineups-api";
import { applyOverride } from "@/lib/utils";
import { getAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/lineups?matchId=M001
 *
 * Returns the live lineups from API-Football when configured, falling back
 * to the deterministic default lineup builder. The static-export build
 * uses only the default.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const matchId = url.searchParams.get("matchId");
  if (!matchId) return NextResponse.json({ error: "missing matchId" }, { status: 400 });

  const base = MATCHES.find(m => m.id === matchId);
  if (!base) return NextResponse.json({ error: "match not found" }, { status: 404 });

  /* Apply any admin override (e.g. time changes don't affect lineups but be consistent) */
  let m = base;
  let liveSquads: Record<string, any> | undefined;
  try {
    const { db } = getAdmin();
    const ov = await db.collection("broadcast_overrides").doc(matchId).get();
    if (ov.exists) m = applyOverride(base, ov.data() as any);

    /* Cached official squads (football-data.org) — fills in default
     * lineups for the 35 teams without curated Hebrew data. */
    const sq = await db.collection("live_data").doc("squads").get();
    if (sq.exists) liveSquads = (sq.data() as any)?.squads || undefined;
  } catch {}

  if (m.homeIsPlaceholder || m.awayIsPlaceholder) {
    return NextResponse.json({ source: "placeholder", lineups: null });
  }

  /* Try the real API; fall back to default */
  const live = await fetchLiveLineups(matchId, m.utc, m.home, m.away);
  if (live) return NextResponse.json({ source: "live", lineups: live });

  const fallback = buildMatchLineups(m.home, m.away, liveSquads);
  return NextResponse.json({ source: "default", lineups: fallback });
}
