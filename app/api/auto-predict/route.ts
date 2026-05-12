import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import { applyOverride } from "@/lib/utils";
import { effectiveUtc, type SimConfig } from "@/lib/sim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.CRON_SECRET || "";

export async function GET(req: Request) {
  if (SECRET) {
    const auth = req.headers.get("authorization") || "";
    if (!auth.endsWith(SECRET)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { db } = getAdmin();
  const now = Date.now();

  const ovSnap = await db.collection("broadcast_overrides").get();
  const overrides: Record<string, any> = {};
  ovSnap.forEach(d => { overrides[d.id] = d.data(); });
  const effective = MATCHES.map(m => applyOverride(m, overrides[m.id]));

  const simSnap = await db.collection("sim_config").doc("global").get();
  const sim = simSnap.exists ? (simSnap.data() as SimConfig) : null;

  const LOCK_MS = 3 * 60 * 1000;
  const just = effective.filter(m => {
    const start = new Date(effectiveUtc(m.utc, sim)).getTime();
    const lockAt = start - LOCK_MS;
    return now >= lockAt && now < start + LOCK_MS;
  });
  if (!just.length) return NextResponse.json({ scanned: 0, inserted: 0 });

  const profSnap = await db.collection("profiles").get();
  const uids = profSnap.docs.map(d => d.id);

  let inserted = 0;
  for (const m of just) {
    for (const uid of uids) {
      const docId = `${uid}_${m.id}`;
      const existing = await db.collection("predictions").doc(docId).get();
      if (existing.exists) continue;
      const h = Math.floor(Math.random() * 4);
      const a = Math.floor(Math.random() * 4);
      await db.collection("predictions").doc(docId).set({
        uid, matchId: m.id, homeScore: h, awayScore: a,
        updatedAt: now, auto: true,
      });
      inserted++;
      const profData = profSnap.docs.find(d => d.id === uid)?.data() as any || {};
      await db.collection("activity").add({
        kind: "prediction.auto",
        uid,
        displayName: profData.displayName || "משתמש",
        avatarId: profData.avatarId || "messi",
        matchId: m.id,
        payload: { home: h, away: a },
        ts: now,
      });
    }
  }

  return NextResponse.json({ scanned: just.length, inserted });
}
