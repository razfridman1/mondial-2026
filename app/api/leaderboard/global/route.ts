import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";
import { userTotals } from "@/lib/scoring";
import { MATCHES } from "@/lib/data";
import type { LeaderRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/leaderboard/global
 *
 * Returns the cross-group leaderboard for ALL users.
 * Requires authentication (any logged-in user can view).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const tokMatch = authHeader.match(/^Bearer (.+)$/);
  if (!tokMatch) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await verifyIdToken(tokMatch[1]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { db, auth } = getAdmin();

  /* Load all profiles */
  const profSnap = await db.collection("profiles").get();
  const uids = profSnap.docs.map(d => d.id);
  const profByUid: Record<string, any> = {};
  profSnap.forEach(d => { profByUid[d.id] = d.data(); });

  if (!uids.length) return NextResponse.json([]);

  /* Load match results */
  const resSnap = await db.collection("match_results").get();
  const stageById = new Map<string, string>();
  for (const m of MATCHES) stageById.set(m.id, m.stage);
  const results: Record<string, { home: number; away: number; finishedAt: number; winner?: string; isKnockout?: boolean }> = {};
  resSnap.forEach(d => {
    const data = d.data() as any;
    const stage = stageById.get(d.id);
    const isKO = data.isKnockout || (stage && stage !== "GROUP");
    const entry: any = { home: data.home, away: data.away, finishedAt: data.finishedAt || Date.now() };
    if (data.winner) entry.winner = data.winner;
    if (isKO) entry.isKnockout = true;
    results[d.id] = entry;
  });

  /* Load bonus awards */
  const bonusSnap = await db.collection("bonus_awards").get();
  const bonusByUid: Record<string, number> = {};
  bonusSnap.forEach(d => {
    const data = d.data() as any;
    if (typeof data.points === "number") bonusByUid[data.uid] = (bonusByUid[data.uid] || 0) + data.points;
  });

  /* Batch-load Firebase Auth metadata */
  const authMetaByUid: Record<string, { displayName?: string; email?: string }> = {};
  for (let i = 0; i < uids.length; i += 100) {
    const chunk = uids.slice(i, i + 100).map(uid => ({ uid }));
    try {
      const res = await auth.getUsers(chunk);
      for (const u of res.users) {
        authMetaByUid[u.uid] = { displayName: u.displayName || undefined, email: u.email || undefined };
      }
    } catch {}
  }

  /* Compute rows */
  const rows: LeaderRow[] = [];
  for (const uid of uids) {
    const profData = profByUid[uid] || {};
    const predSnap = await db.collection("predictions").where("uid", "==", uid).get();
    const preds = predSnap.docs.map(d => d.data() as any);
    const t = userTotals(preds, results, bonusByUid[uid] || 0);
    const authMeta = authMetaByUid[uid] || {};
    const displayName =
      profData.displayName ||
      authMeta.displayName ||
      (authMeta.email ? authMeta.email.split("@")[0] : null) ||
      "משתמש";
    rows.push({ uid, displayName, avatarId: profData.avatarId || "messi", ...t });
  }

  rows.sort((a, b) =>
    b.totalPoints - a.totalPoints ||
    b.exactCount  - a.exactCount  ||
    b.streak      - a.streak);
  rows.forEach((r, i) => r.rank = i + 1);

  return NextResponse.json(rows);
}
