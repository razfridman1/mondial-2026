import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { userTotals } from "@/lib/scoring";
import type { LeaderRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* =====================================================================
 * GET /api/cron/snapshot-leaderboard
 *
 * Computes and stores the daily leaderboard snapshot.
 * Triggered automatically by Vercel Cron (see vercel.json) at 21:00 UTC
 * which is midnight Israel time during DST (June-July 2026).
 *
 * Storage: collection `leaderboard_snapshots`, doc id = YYYY-MM-DD (Israel TZ).
 *
 * Manual trigger from admin UI also supported via POST (same handler).
 * ===================================================================*/

const SECRET = process.env.CRON_SECRET || "";

function israelDateKey(d = new Date()): string {
  /* Returns the YYYY-MM-DD in Asia/Jerusalem timezone */
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
}

async function snapshot(triggeredBy: string) {
  const { db } = getAdmin();
  const dateKey = israelDateKey();

  /* Load match results — include winner + isKnockout for correct KO scoring */
  const resSnap = await db.collection("match_results").get();
  const stageById = new Map<string, string>();
  const { MATCHES } = await import("@/lib/data");
  for (const m of MATCHES) stageById.set(m.id, m.stage);
  const results: Record<string, { home: number; away: number; finishedAt: number; winner?: string; isKnockout?: boolean }> = {};
  resSnap.forEach(d => {
    const data = d.data() as any;
    const stage = stageById.get(d.id);
    const isKO = data.isKnockout || (stage && stage !== "GROUP");
    const entry: any = { home: data.home, away: data.away, finishedAt: data.finishedAt || 0 };
    if (data.winner) entry.winner = data.winner;
    if (isKO) entry.isKnockout = true;
    results[d.id] = entry;
  });

  /* Load all profiles */
  const profSnap = await db.collection("profiles").get();
  const allUids = profSnap.docs.map(d => d.id);
  const profByUid: Record<string, any> = {};
  profSnap.forEach(d => { profByUid[d.id] = d.data(); });

  /* Compute global leaderboard */
  async function computeFor(uids: string[]): Promise<LeaderRow[]> {
    const rows: LeaderRow[] = [];
    for (const uid of uids) {
      const prof = profByUid[uid] || {};
      const predSnap = await db.collection("predictions").where("uid", "==", uid).get();
      const preds = predSnap.docs.map(d => d.data() as any);
      const t = userTotals(preds, results);
      rows.push({
        uid,
        displayName: prof.displayName || "משתמש",
        avatarId: prof.avatarId || "messi",
        ...t,
      });
    }
    rows.sort((a, b) =>
      b.totalPoints - a.totalPoints ||
      b.exactCount  - a.exactCount  ||
      b.streak      - a.streak);
    rows.forEach((r, i) => r.rank = i + 1);
    return rows;
  }

  const globalRows = await computeFor(allUids);

  /* Per-group leaderboards */
  const groupsSnap = await db.collection("groups").get();
  const memSnap = await db.collection("group_memberships").get();
  const memsByGroup: Record<string, string[]> = {};
  memSnap.forEach(d => {
    const data = d.data() as any;
    if (!memsByGroup[data.groupId]) memsByGroup[data.groupId] = [];
    memsByGroup[data.groupId].push(data.uid);
  });
  const groups: Record<string, { name: string; rows: LeaderRow[] }> = {};
  for (const gDoc of groupsSnap.docs) {
    const gData = gDoc.data() as any;
    const uids = memsByGroup[gDoc.id] || [];
    if (!uids.length) continue;
    groups[gDoc.id] = {
      name: gData.name || "—",
      rows: await computeFor(uids),
    };
  }

  /* Save the snapshot doc */
  const snapshot = {
    dateKey,
    savedAt: Date.now(),
    triggeredBy,
    global: globalRows,
    groups,
    totals: {
      users: allUids.length,
      groups: Object.keys(groups).length,
      finishedMatches: Object.keys(results).length,
    },
  };
  await db.collection("leaderboard_snapshots").doc(dateKey).set(snapshot);
  return snapshot;
}

export async function GET(req: Request) {
  /* Vercel Cron sends the request with a special header we can verify */
  if (SECRET) {
    const auth = req.headers.get("authorization") || "";
    if (!auth.endsWith(SECRET)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }
  try {
    const data = await snapshot("cron");
    return NextResponse.json({ ok: true, dateKey: data.dateKey, totals: data.totals });
  } catch (e: any) {
    return NextResponse.json({ error: "snapshot_failed", message: e?.message || String(e) }, { status: 500 });
  }
}

/* Manual trigger from admin UI (requires admin auth, not CRON_SECRET) */
export async function POST(req: Request) {
  const { isAdminEmail, verifyIdToken } = await import("@/lib/firebase-admin");
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  if (!isAdminEmail(decoded.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const data = await snapshot(`admin:${decoded.email}`);
    return NextResponse.json({ ok: true, dateKey: data.dateKey, totals: data.totals });
  } catch (e: any) {
    return NextResponse.json({ error: "snapshot_failed", message: e?.message || String(e) }, { status: 500 });
  }
}
