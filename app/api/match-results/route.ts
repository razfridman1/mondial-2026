import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/match-results — public list of all finished match results.
 * Returns { [matchId]: { home, away, finishedAt } } */
export async function GET() {
  try {
    const { db } = getAdmin();
    const snap = await db.collection("match_results").get();
    const out: Record<string, { home: number; away: number; finishedAt: number }> = {};
    snap.forEach(d => {
      const data = d.data() as any;
      out[d.id] = {
        home: data.home,
        away: data.away,
        finishedAt: data.finishedAt || 0,
      };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
