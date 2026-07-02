import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";
import { groupStageComplete, stageComplete } from "@/lib/bracket";
import type { MatchResult } from "@/lib/standings";
import type { TopPick } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================================
 * /api/top-picks
 *
 * GET  — returns caller's picks + locked flags.
 * POST — sets topScorer + topAssist (lock: group stage complete).
 *        Also accepts optional champion (lock: QF complete).
 * ===================================================================*/

async function getLockState(db: FirebaseFirestore.Firestore): Promise<{
  locked: boolean;
  championLocked: boolean;
}> {
  const snap = await db.collection("match_results").get();
  const results: Record<string, MatchResult> = {};
  snap.forEach(d => {
    const data = d.data() as any;
    results[d.id] = {
      home: data.home,
      away: data.away,
      finishedAt: data.finishedAt || 0,
      ...(data.winner ? { winner: data.winner } : {}),
    };
  });
  // Extended deadline: scorer/assist picks open until end of June 30, 2026 (Israel time)
  const SCORER_DEADLINE = new Date("2026-06-30T23:59:59+03:00").getTime();
  const scorerDeadlinePassed = Date.now() > SCORER_DEADLINE;
  return {
    locked: scorerDeadlinePassed && groupStageComplete(results),
    championLocked: stageComplete("QF", results),
  };
}

function getUid(req: Request): Promise<string> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  return verifyIdToken(m[1]).then(d => d.uid).catch(e => {
    throw Object.assign(new Error(e.message || "unauthorized"), { status: 401 });
  });
}

export async function GET(req: Request) {
  let uid: string;
  try { uid = await getUid(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const { db } = getAdmin();
  const snap = await db.collection("profiles").doc(uid).get();
  const data = snap.exists ? (snap.data() || {}) : {};
  const { locked, championLocked } = await getLockState(db);
  return NextResponse.json({
    topScorerPick: data.topScorerPick || null,
    topAssistPick: data.topAssistPick || null,
    championPick: data.championPick || null,
    locked: locked && !data.topPicksUnlocked,
    championLocked,
  });
}

export async function POST(req: Request) {
  let uid: string;
  try { uid = await getUid(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const body = await req.json().catch(() => ({}));
  const { topScorer, topAssist, champion } = body as {
    topScorer?: { teamCode?: string; playerName?: string };
    topAssist?: { teamCode?: string; playerName?: string };
    champion?: { teamCode?: string };
  };

  const { db } = getAdmin();
  const { locked, championLocked } = await getLockState(db);
  const ref = db.collection("profiles").doc(uid);
  const now = Date.now();
  const updatePayload: any = {};

  /* Scorer + Assist picks */
  if (topScorer || topAssist) {
    const snap = await ref.get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const effectiveLocked = locked && !data.topPicksUnlocked;
    if (effectiveLocked) {
      return NextResponse.json({
        error: "locked",
        message: "שלב הבתים הסתיים — לא ניתן לשנות את הבחירה",
        topScorerPick: data.topScorerPick || null,
        topAssistPick: data.topAssistPick || null,
      }, { status: 403 });
    }
    if (!topScorer?.teamCode || !topScorer?.playerName || !topAssist?.teamCode || !topAssist?.playerName) {
      return NextResponse.json({ error: "missing topScorer/topAssist {teamCode, playerName}" }, { status: 400 });
    }
    updatePayload.topScorerPick = { teamCode: topScorer.teamCode, playerName: topScorer.playerName, setAt: now };
    updatePayload.topAssistPick = { teamCode: topAssist.teamCode, playerName: topAssist.playerName, setAt: now };
  }

  /* Champion pick */
  if (champion) {
    if (championLocked) {
      return NextResponse.json({
        error: "champion_locked",
        message: "רבע הגמר הסתיים — לא ניתן לשנות את ניחוש הזוכה",
      }, { status: 403 });
    }
    if (!champion.teamCode) {
      return NextResponse.json({ error: "missing champion.teamCode" }, { status: 400 });
    }
    updatePayload.championPick = { teamCode: champion.teamCode, setAt: now };
  }

  if (!Object.keys(updatePayload).length) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  await ref.set(updatePayload, { merge: true });

  return NextResponse.json({
    ok: true,
    ...(updatePayload.topScorerPick ? {
      topScorerPick: updatePayload.topScorerPick,
      topAssistPick: updatePayload.topAssistPick,
    } : {}),
    ...(updatePayload.championPick ? { championPick: updatePayload.championPick } : {}),
  });
}
