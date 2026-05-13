import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authedAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const decoded = await verifyIdToken(m[1]);
  if (!isAdminEmail(decoded.email)) throw Object.assign(new Error("forbidden"), { status: 403 });
  return decoded;
}

/* GET /api/admin/leaderboard-snapshots
 *   ?date=YYYY-MM-DD   → returns full snapshot for that date
 *   (no params)        → returns list of available dates with summary
 *
 * DELETE { dateKey } — removes a specific snapshot
 * =====================================================================*/

export async function GET(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const url = new URL(req.url);
  const date = url.searchParams.get("date");

  const { db } = getAdmin();

  if (date) {
    const snap = await db.collection("leaderboard_snapshots").doc(date).get();
    if (!snap.exists) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(snap.data());
  }

  /* List all snapshots — sorted newest first */
  const snap = await db.collection("leaderboard_snapshots").orderBy("dateKey", "desc").get();
  const list = snap.docs.map(d => {
    const data = d.data() as any;
    return {
      dateKey: d.id,
      savedAt: data.savedAt,
      triggeredBy: data.triggeredBy,
      totals: data.totals || {},
      /* Top 3 from global for quick preview */
      topThree: (data.global || []).slice(0, 3).map((r: any) => ({
        rank: r.rank, displayName: r.displayName, totalPoints: r.totalPoints,
      })),
    };
  });
  return NextResponse.json(list);
}

export async function DELETE(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const body = await req.json().catch(() => ({}));
  const { dateKey } = body;
  if (!dateKey) return NextResponse.json({ error: "missing dateKey" }, { status: 400 });

  const { db } = getAdmin();
  await db.collection("leaderboard_snapshots").doc(dateKey).delete();
  return NextResponse.json({ ok: true, deleted: dateKey });
}
