import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import { canUseJoker, recordJokerUsage, type JokerUsage } from "@/lib/joker";
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
  const { matchId, homeScore, awayScore, joker } = body;
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
  let appliedJoker = false;
  const existingSnap = await db.collection("predictions").doc(docId).get();
  const existing: any = existingSnap.data() || {};
  const wantJoker = !!joker;
  const hadJoker = !!existing.joker;

  if (wantJoker && !hadJoker) {
    const usageRef = db.collection("joker_usage").doc(decoded.uid);
    const usageSnap = await usageRef.get();
    const usage = (usageSnap.data() as JokerUsage) || null;
    const check = canUseJoker(usage, match.stage);
    if (!check.ok) {
      return NextResponse.json({ error: "joker_blocked", message: check.reason }, { status: 403 });
    }
    appliedJoker = true;
    const next = recordJokerUsage(usage, match.stage);
    await usageRef.set(next, { merge: true });
  } else if (!wantJoker && hadJoker) {
    const usageRef = db.collection("joker_usage").doc(decoded.uid);
    const usageSnap = await usageRef.get();
    const usage = (usageSnap.data() as JokerUsage) || null;
    if (usage?.perStage?.[match.stage]) {
      const stageKey = match.stage as keyof typeof usage.perStage;
      const refunded: JokerUsage = {
        perStage: { ...usage.perStage, [stageKey]: Math.max(0, (usage.perStage[stageKey] || 0) - 1) },
        lastUsedAt: usage.lastUsedAt,
      };
      await usageRef.set(refunded, { merge: true });
    }
    appliedJoker = false;
  } else {
    appliedJoker = hadJoker;
  }

  await db.collection("predictions").doc(docId).set({
    uid: decoded.uid, matchId,
    homeScore: h, awayScore: a,
    joker: appliedJoker,
    updatedAt: Date.now(),
  }, { merge: true });

  return NextResponse.json({ ok: true, joker: appliedJoker });
}
