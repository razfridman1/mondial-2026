import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { userTotals } from "@/lib/scoring";
import { MATCHES } from "@/lib/data";
import type { LeaderRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/leaderboard?groupId=...
 * Returns the leaderboard scoped to a group (or global if omitted). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId");

  const { db } = getAdmin();

  /* 1. Find user uids in the requested group (or all users if global) */
  let uids: string[];
  if (groupId) {
    const memSnap = await db.collection("group_memberships").where("groupId", "==", groupId).get();
    /* Exclude soft-left members from the leaderboard. */
    uids = memSnap.docs
      .filter(d => !(d.data() as any).left)
      .map(d => d.data().uid as string);
  } else {
    const profSnap = await db.collection("profiles").get();
    uids = profSnap.docs.map(d => d.id);
  }

  if (!uids.length) return NextResponse.json([]);

  /* 2. Load match results — including KO-specific fields (winner, isKnockout) */
  const resSnap = await db.collection("match_results").get();
  const results: Record<string, { home: number; away: number; finishedAt: number; winner?: string; isKnockout?: boolean }> = {};
  /* Build a stage lookup so we can flag knockouts even if the DB doc didn't
   * store isKnockout (older docs). */
  const stageById = new Map<string, string>();
  for (const m of MATCHES) stageById.set(m.id, m.stage);
  resSnap.forEach(d => {
    const data = d.data() as any;
    const stage = stageById.get(d.id);
    const isKO = data.isKnockout || (stage && stage !== "GROUP");
    const entry: any = {
      home: data.home,
      away: data.away,
      finishedAt: data.finishedAt || Date.now(),
    };
    if (data.winner) entry.winner = data.winner;
    if (isKO) entry.isKnockout = true;
    results[d.id] = entry;
  });

  /* 2b. Load bonus awards (manual admin adjustments) and sum per user */
  const bonusSnap = await db.collection("bonus_awards").get();
  const bonusByUid: Record<string, number> = {};
  bonusSnap.forEach(d => {
    const data = d.data() as any;
    if (typeof data.points === "number") {
      bonusByUid[data.uid] = (bonusByUid[data.uid] || 0) + data.points;
    }
  });

  /* 3. Load profiles and predictions for each user */
  const rows: LeaderRow[] = [];
  for (const uid of uids) {
    const prof = await db.collection("profiles").doc(uid).get();
    const profData = prof.data() as any || {};
    const predSnap = await db.collection("predictions").where("uid", "==", uid).get();
    const preds = predSnap.docs.map(d => d.data() as any);
    const t = userTotals(preds, results, bonusByUid[uid] || 0);
    rows.push({
      uid,
      displayName: profData.displayName || "משתמש",
      avatarId: profData.avatarId || "messi",
      ...t,
    });
  }

  /* 4. Sort by points desc, then exactCount desc, then streak desc */
  rows.sort((a, b) =>
    b.totalPoints - a.totalPoints ||
    b.exactCount  - a.exactCount  ||
    b.streak      - a.streak);
  rows.forEach((r, i) => r.rank = i + 1);

  return NextResponse.json(rows);
}
