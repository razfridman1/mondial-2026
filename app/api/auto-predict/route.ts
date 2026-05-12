import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import { applyOverride } from "@/lib/utils";
import { effectiveUtc, type SimConfig } from "@/lib/sim";

export const runtime = "nodejs";
export const maxDuration = 60;

/* =====================================================================
 * Auto-prediction worker. Run by Vercel Cron every 5 minutes.
 *
 * Triggers at the *LOCK* time (3 min before kickoff), so that every user
 * who didn't submit a prediction gets a random one BEFORE the match
 * starts. Once written, the regular 3-min lock prevents further edits.
 *
 * Window: kickoff-3min ≤ now < kickoff+3min (covers the 5-min cron tick).
 * ===================================================================*/

const SECRET = process.env.CRON_SECRET || "";

export async function GET(req: Request) {
  if (SECRET) {
    const auth = req.headers.get("authorization") || "";
    if (!auth.endsWith(SECRET)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { db } = getAdmin();
  const now = Date.now();

  /* overrides */
  const ovSnap = await db.collection("broadcast_overrides").get();
  const overrides: Record<string, any> = {};
  ovSnap.forEach(d => { overrides[d.id] = d.data(); });
  const effective = MATCHES.map(m => applyOverride(m, overrides[m.id]));

  /* Honor simulation when checking kickoff time */
  const simSnap = await db.collection("sim_config").doc("global").get();
  const sim = simSnap.exists ? (simSnap.data() as SimConfig) : null;

  /* Matches whose 3-min lock just kicked in (in effective time).
   * Window goes from (lock time) until (kickoff + 3min) to safely cover a 5-min cron tick. */
  const LOCK_MS = 3 * 60 * 1000;
  const just = effective.filter(m => {
    const start = new Date(effectiveUtc(m.utc, sim)).getTime();
    const lockAt = start - LOCK_MS;
    return now >= lockAt && now < start + LOCK_MS;
  });
  if (!just.length) return NextResponse.json({ scanned: 0, inserted: 0 });

  /* "active users" = anyone with a profile */
  const profSnap = await db.collection("profiles").get();
  const uids = profSnap.docs.map(d => d.id);

  let inserted = 0;
  for (const m of just) {
    for (const uid of uids) {
      const docId = `${uid}_${m.id}`;
      const existing = await db.collection("predictions").doc(docId).get();
      if (existing.exists) continue;
      const h = Math.floor(Math.random() * 4); // 0..3
      const a = Math.floor(Math.random() * 4);
      await db.collection("predictions").doc(docId).set({
        uid, matchId: m.id,
        homeScore: h, awayScore: a,
        updatedAt: now,
        auto: true,
      });
      inserted++;
      // Activity entry — visible to all groups the user is in
      await db.collection("activity").add({
        kind: "prediction.auto",
        uid,
        displayName: (profSnap.docs.find(d => d.id === uid)?.data() as any)?.displayName || "משתמש",
        avatarId: (profSnap.docs.find(d => d.id === uid)?.data() as any)?.avatarId || "messi",
        matchId: m.id,
        payload: { home: h, away: a },
        ts: now,
      });
    }
  }

  return NextResponse.json({ scanned: just.length, inserted });
}
