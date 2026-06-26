import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { cacheScorerLeaderboards } from "@/lib/scorers-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* POST /api/admin/sync-scorers
 * Fetches top scorers/assists from football-data.org and writes them to
 * live_data/cached_scorers in Firestore so the tab updates immediately. */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded: any;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  if (!isAdminEmail(decoded.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { db } = getAdmin();
  const result = await cacheScorerLeaderboards(db);
  if (!result) {
    return NextResponse.json({ error: "football-data.org returned no data — check FOOTBALL_API_KEY" }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    scorers: result.scorers.length,
    assists: result.assists.length,
    top3scorers: result.scorers.slice(0, 3),
    top3assists: result.assists.slice(0, 3),
  });
}
