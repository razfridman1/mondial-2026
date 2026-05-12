import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import { canUseJoker, recordJokerUsage, type JokerUsage } from "@/lib/joker";
import { effectiveUtc, type SimConfig } from "@/lib/sim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/predictions?uid=...  → list predictions for a user
 * (publicly readable so the user's own client can hydrate quickly) */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const uid = url.searchParams.get("uid");
  if (!uid) return NextResponse.json([], { status: 200 });
  const { db } = getAdmin();
  const snap = await db.collection("predictions").where("uid", "==", uid).get();
  const out = snap.docs.map(d => d.data());
  return NextResponse.json(out);
}

/* POST /api/predictions  { matchId, homeScore, awayScore }
 * Body must come from an authenticated user. Locks 3 minutes before kickoff. */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const body = await req.json();
  const { matchId, homeScore, awayScore, joker } = body;
  const match = MATCHES.find(x => x.id === matchId);
  if (!match) return NextResponse.json({ error: "match not found" }, { status: 404 });

  /* 3-minute lock check (server-side enforcement) — honors simulation if active */
  const { db: _db } = getAdmin();
  const simSnap = await _db.collection("sim_config").doc("global").get();
  const sim = simSnap.exists ? (simSnap.data() as SimConfig) : null;
  const effectiveStart = new Date(effectiveUtc(match.utc, sim)).getTime();
  if (Date.now() >= effectiveStart - 3 * 60 * 1000) {
    return NextResponse.json({ error: "locked", message: "הניחוש נעול — לא ניתן לעדכן יותר" }, { status: 403 });
  }

  const h = Number(homeScore);
  const a = Number(awayScore);
  if (!Number.isFinite(h) || !Number.isFinite(a) || h < 0 || a < 0 || h > 20