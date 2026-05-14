import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import { effectiveUtc, type SimConfig } from "@/lib/sim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const uid = url.searchParams.get("uid");
  if (!uid) return NextResponse.json([], { status: 200 });
  const { db } = getAdmin();
  const snap = await db.collection("predictions").where("uid", "==", uid).get();
  const out = snap.docs.map(d => d.data());
  return NextResponse.json(out);
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const body = await req.json();
  const { matchId, homeScore, awayScore, predictedWinner } = body;
  const match = MATCHES.find(x => x.id === matchId);
  if (!match) return NextResponse.json({ error: "match not found" }, { status: 404 });

  const { db } = getAdmin();
  const simSnap = await db.collection("sim_config").doc("global").get();
  const sim = simSnap.exists ? (simSnap.data() as SimConfig) : null;
  const effectiveStart = new Date(effectiveUtc(match.utc, sim)).getTime();
  if (Date.now() >= effectiveStart - 3 * 60 * 1000) {
    return NextResponse.json({ error: "locked", message: "הניחוש נעול — לא ניתן לעדכן יותר" }, { status: 403 });
  }

  const h = Number(homeScore);
  const a = Number(awayScore);
  if (!Number.isFinite(h) || !Number.isFinite(a) || h < 0 || a < 0 || h > 20 || a > 20) {
    return NextResponse.json({ error: "invalid scores" }, { status: 400 });
  }

  const docId = `${decoded.uid}_${matchId}`;
  /* For knockout matches we also store a predictedWinner (team code). When
   * the 90-min score isn't a tie, the winner is unambiguous so we derive
   * from the score; otherwise the client must send a valid team code. */
  const isKO = match.stage !== "GROUP";
  let pw: string | null = null;
  if (isKO) {
    if (h > a)      pw = match.home;
    else if (a > h) pw = match.away;
    else if (typeof predictedWinner === "string" && predictedWinner.trim()) {
      pw = predictedWinner.trim();
    }
  }
  const payload: any = {
    uid: decoded.uid, matchId,
    homeScore: h, awayScore: a,
    joker: false,
    updatedAt: Date.now(),
  };
  if (pw) payload.predictedWinner = pw;
  await db.collection("predictions").doc(docId).set(payload, { merge: true });

  return NextResponse.json({ ok: true, joker: false });
}
