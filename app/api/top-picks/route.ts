import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";
import type { TopPick } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================================
 * /api/top-picks — one-time, irrevocable picks for "מלך השערים והבישולים".
 *
 * GET  — returns the caller's current picks (or nulls if not set yet).
 * POST — sets BOTH picks (topScorer + topAssist) ONCE. If either pick is
 *        already set on the user's profile, the request is rejected with
 *        403 — there is no edit/changing path by design.
 * ===================================================================*/

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
  return NextResponse.json({
    topScorerPick: data.topScorerPick || null,
    topAssistPick: data.topAssistPick || null,
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
  const ref = db.collection("profiles").doc(uid);
  const snap = await ref.get();
  const data = snap.exists ? (snap.data() || {}) : {};

  if (data.topScorerPick || data.topAssistPick) {
    return NextResponse.json({
      error: "already_picked",
      message: "כבר בחרת — הבחירה היא חד-פעמית ולא ניתן לשנות אותה",
      topScorerPick: data.topScorerPick || null,
      topAssistPick: data.topAssistPick || null,
    }, { status: 403 });
  }

  const now = Date.now();
  const topScorerPick: TopPick = { teamCode: topScorer.teamCode, playerName: topScorer.playerName, setAt: now };
  const topAssistPick: TopPick = { teamCode: topAssist.teamCode, playerName: topAssist.playerName, setAt: now };

  await ref.set({ topScorerPick, topAssistPick }, { merge: true });

  return NextResponse.json({ ok: true, topScorerPick, topAssistPick });
}
