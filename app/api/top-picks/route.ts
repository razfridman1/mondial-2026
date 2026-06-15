import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";
import { groupStageComplete } from "@/lib/bracket";
import type { MatchResult } from "@/lib/standings";
import type { TopPick } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================================
 * /api/top-picks — picks for "מלך השערים והבישולים".
 *
 * GET  — returns the caller's current picks (or nulls if not set yet),
 *        plus `locked` (true once the group stage is complete).
 * POST — sets BOTH picks (topScorer + topAssist). Can be changed freely
 *        until the group stage is complete (groupStageComplete) — once
 *        every group's 3 matches have a result, picks are locked and the
 *        request is rejected with 403.
 * ===================================================================*/

async function isLocked(db: FirebaseFirestore.Firestore): Promise<boolean> {
  const snap = await db.collection("match_results").get();
  const results: Record<string, MatchResult> = {};
  snap.forEach(d => {
    const data = d.data() as any;
    results[d.id] = { home: data.home, away: data.away, finishedAt: data.finishedAt || 0, ...(data.winner ? { winner: data.winner } : {}) };
  });
  return groupStageComplete(results);
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
  const locked = await isLocked(db);
  return NextResponse.json({
    topScorerPick: data.topScorerPick || null,
    topAssistPick: data.topAssistPick || null,
    locked,
  });
}

export async function POST(req: Request) {
  let uid: string;
  try { uid = await getUid(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const body = await req.json().catch(() => ({}));
  const { topScorer, topAssist } = body as {
    topScorer?: { teamCode?: string; playerName?: string };
    topAssist?: { teamCode?: string; playerName?: string };
  };

  if (
    !topScorer?.teamCode || !topScorer?.playerName ||
    !topAssist?.teamCode || !topAssist?.playerName
  ) {
    return NextResponse.json({ error: "missing topScorer/topAssist {teamCode, playerName}" }, { status: 400 });
  }

  const { db } = getAdmin();

  if (await isLocked(db)) {
    const ref = db.collection("profiles").doc(uid);
    const snap = await ref.get();
    const data = snap.exists ? (snap.data() || {}) : {};
    return NextResponse.json({
      error: "locked",
      message: "שלב הבתים הסתיים — לא ניתן לשנות יותר את הבחירה",
      topScorerPick: data.topScorerPick || null,
      topAssistPick: data.topAssistPick || null,
    }, { status: 403 });
  }

  const ref = db.collection("profiles").doc(uid);
  const now = Date.now();
  const topScorerPick: TopPick = { teamCode: topScorer.teamCode, playerName: topScorer.playerName, setAt: now };
  const topAssistPick: TopPick = { teamCode: topAssist.teamCode, playerName: topAssist.playerName, setAt: now };

  await ref.set({ topScorerPick, topAssistPick }, { merge: true });

  return NextResponse.json({ ok: true, topScorerPick, topAssistPick });
}
