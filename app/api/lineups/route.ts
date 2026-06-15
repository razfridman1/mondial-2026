import { NextResponse } from "next/server";
import { MATCHES } from "@/lib/data";
import { fetchLiveLineups, fetchAiLineups } from "@/lib/lineups-api";
import { applyOverride } from "@/lib/utils";
import { getAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* GET /api/lineups?matchId=M001
 *
 * Returns the OFFICIAL published lineup — from API-Football if configured,
 * otherwise via an AI web-search fallback (lookupLineupsViaAI) — if and only
 * if it has actually been published (typically ~1 hour before kickoff). We
 * never fabricate or guess a lineup — if nothing real has been published
 * yet, we return lineups: null and the client shows a "not published yet"
 * notice instead of any estimated/fictional XI.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const matchId = url.searchParams.get("matchId");
  const force = url.searchParams.get("force") === "1";
  const debug = url.searchParams.get("debug") === "1";
  if (!matchId) return NextResponse.json({ error: "missing matchId" }, { status: 400 });

  const base = MATCHES.find(m => m.id === matchId);
  if (!base) return NextResponse.json({ error: "match not found" }, { status: 404 });

  /* Apply any admin override (e.g. time changes don't affect lineups but be consistent) */
  let m = base;
  try {
    const { db } = getAdmin();
    const ov = await db.collection("broadcast_overrides").doc(matchId).get();
    if (ov.exists) m = applyOverride(base, ov.data() as any);
  } catch {}

  if (m.homeIsPlaceholder || m.awayIsPlaceholder) {
    return NextResponse.json({ source: "placeholder", lineups: null });
  }

  /* Only ever return a real, officially published lineup */
  const live = await fetchLiveLineups(matchId, m.utc, m.home, m.away);
  if (live) return NextResponse.json({ source: "live", lineups: live });

  const ai = await fetchAiLineups(matchId, m.utc, m.home, m.away, { force });
  if (ai) return NextResponse.json({ source: "ai", lineups: ai });

  if (debug) {
    const { db } = getAdmin();
    const doc = await db.collection("live_lineups").doc(matchId).get();
    return NextResponse.json({ source: "not_published", lineups: null, debug: doc.exists ? doc.data() : null, kickoffUtc: m.utc, nowUtc: new Date().toISOString() });
  }

  return NextResponse.json({ source: "not_published", lineups: null });
}
