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

  /* Match qualifies for auto-prediction if:
   *   - The lock time has passed (start - 3 min)
   *   - The match hasn't been in this state for more than 24 hours
   *     (don't keep retrying ancient matches forever)
   *
   * Wider window than before — robust against cron lag/outages. */
  const LOCK_MS = 3 * 60 * 1000;
  const MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000;
  const just = effective.filter(m => {
    const start = new Date(effectiveUtc(m.utc, sim)).getTime();
    const lockAt = start - LOCK_MS;
    return now >= lockAt && now < start + MAX_LOOKBACK_MS;
  });
  if (!just.length) return NextResponse.json({ scanned: 0, inserted: 0 });

  const profSnap = await db.collection("profiles").get();
  const uids = profSnap.docs.map(d => d.id);

  let inserted = 0;
  let skipped = 0;
  for (const m of just) {
    for (const uid of uids) {
      const docId = `${uid}_${m.id}`;
      const existing = await db.collection("predictions").doc(docId).get();
      if (existing.exists) { skipped++; continue; }
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

  return NextResponse.json({ scanned: just.length, inserted, skipped });
}

/* POST: manual trigger by super-admin (bypasses CRON_SECRET check) */
export async function POST(req: Request) {
  const { isAdminEmail, verifyIdToken } = await import("@/lib/firebase-admin");
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  if (!isAdminEmail(decoded.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  /* Reuse the GET logic by issuing an internal call with no SECRET check */
  /* For simplicity we just inline the same logic here */
  const { getAdmin } = await import("@/lib/firebase-admin");
  const { db } = getAdmin();
  const now = Date.now();

  const ovSnap = await db.collection("broadcast_overrides").get();
  const overrides: Record<string, any> = {};
  ovSnap.forEach(d => { overrides[d.id] = d.data(); });
  const effective = MATCHES.map(m => applyOverride(m, overrides[m.id]));
  const simSnap = await db.collection("sim_config").doc("global").get();
  const sim = simSnap.exists ? (simSnap.data() as SimConfig) : null;

  const LOCK_MS = 3 * 60 * 1000;
  const MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000;
  const just = effective.filter(m => {
    const start = new Date(effectiveUtc(m.utc, sim)).getTime();
    const lockAt = start - LOCK_MS;
    return now >= lockAt && now < start + MAX_LOOKBACK_MS;
  });
  if (!just.length) return NextResponse.json({ scanned: 0, inserted: 0 });

  const profSnap = await db.collection("profiles").get();
  const uids = profSnap.docs.map(d => d.id);

  let inserted = 0, skipped = 0;
  for (const m of just) {
    for (const uid of uids) {
      const docId = `${uid}_${m.id}`;
      const existing = await db.collection("predictions").doc(docId).get();
      if (existing.exists) { skipped++; continue; }
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

  return NextResponse.json({ ok: true, scanned: just.length, inserted, skipped });
}
