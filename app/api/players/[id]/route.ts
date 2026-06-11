import { NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebase-admin";
import { fetchPersonProfile, fetchPersonSeasonStats } from "@/lib/football-data-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================================
 * GET /api/players/[id]
 *
 * On-demand player detail card — used by the "הנבחרות שלי" tab when a
 * user clicks a player in TeamDossier's squad list.
 *
 * Only "live" players (id format `${teamCode}_${footballDataPersonId}`,
 * e.g. "BEL_98765") have a football-data.org person id; curated/hand-
 * written stars don't, and the frontend shows their existing curated
 * info directly without calling this route.
 *
 * Fetches /persons/{id} (bio + current club) and /persons/{id}/matches
 * (this season's aggregated stats + recent match log) and merges them.
 * Cached in Firestore (`live_data/player_profiles`) for 12h to stay
 * within football-data.org's free-tier rate limit (10 req/min, shared
 * with the live-score and squad-enrichment crons).
 * ===================================================================*/

const TTL_MS = 12 * 60 * 60 * 1000; // 12h

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });

  const personId = id.includes("_") ? id.split("_").pop()! : "";
  if (!/^\d+$/.test(personId)) {
    return NextResponse.json({ ok: false, error: "not a live player", live: false }, { status: 404 });
  }

  const apiKey = process.env.FOOTBALL_API_KEY;
  const baseUrl = process.env.FOOTBALL_API_URL || "https://api.football-data.org/v4";

  let db: Firestore | null = null;
  try {
    db = getAdmin().db;
  } catch {
    db = null;
  }

  const docRef = db?.collection("live_data").doc("player_profiles");
  let cached: any = null;
  if (docRef) {
    try {
      const snap = await docRef.get();
      cached = snap.exists ? (snap.data() as any)?.players?.[id] : null;
    } catch {}
  }

  const fresh = cached && cached.fetchedAt && (Date.now() - cached.fetchedAt) < TTL_MS;
  if (fresh) {
    return NextResponse.json({ ok: true, live: true, profile: cached.profile, stats: cached.stats, fetchedAt: cached.fetchedAt, source: "cache" });
  }

  if (!apiKey) {
    if (cached) {
      return NextResponse.json({ ok: true, live: true, profile: cached.profile, stats: cached.stats, fetchedAt: cached.fetchedAt, source: "stale" });
    }
    return NextResponse.json({ ok: false, error: "FOOTBALL_API_KEY not configured" }, { status: 503 });
  }

  const [profile, stats] = await Promise.all([
    fetchPersonProfile(personId, apiKey, baseUrl),
    fetchPersonSeasonStats(personId, apiKey, baseUrl),
  ]);

  if (!profile && !stats) {
    if (cached) {
      return NextResponse.json({ ok: true, live: true, profile: cached.profile, stats: cached.stats, fetchedAt: cached.fetchedAt, source: "stale" });
    }
    return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 502 });
  }

  const now = Date.now();
  const finalProfile = profile || cached?.profile || null;
  const finalStats = stats || cached?.stats || null;

  if (docRef) {
    try {
      await docRef.set({
        players: { [id]: { profile: finalProfile, stats: finalStats, fetchedAt: now } },
        updatedAt: now,
      }, { merge: true });
    } catch {}
  }

  return NextResponse.json({ ok: true, live: true, profile: finalProfile, stats: finalStats, fetchedAt: now, source: "live" });
}
