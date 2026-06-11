import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authedAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const decoded = await verifyIdToken(m[1]);
  if (!isAdminEmail(decoded.email)) throw Object.assign(new Error("forbidden"), { status: 403 });
  return decoded;
}

/* GET /api/admin/results/history?matchId=... — list automatic backups for a
 * match (newest first). Each entry is a real snapshot of match_results/{matchId}
 * as it existed right before an admin update/delete. */
export async function GET(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const url = new URL(req.url);
  const matchId = url.searchParams.get("matchId");
  if (!matchId) return NextResponse.json({ error: "missing matchId" }, { status: 400 });
  const { db } = getAdmin();
  const snap = await db.collection("match_results_history").where("matchId", "==", matchId).limit(50).get();
  const rows = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as any))
    .sort((a, b) => (b.backedUpAt || 0) - (a.backedUpAt || 0))
    .slice(0, 20);
  return NextResponse.json(rows);
}

/* POST /api/admin/results/history { matchId, backupId } — restore a backup
 * snapshot. The current state is backed up first (so this is reversible too),
 * then the snapshot's real data is written back into match_results/{matchId}. */
export async function POST(req: Request) {
  let decoded;
  try { decoded = await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const body = await req.json().catch(() => ({}));
  const { matchId, backupId } = body || {};
  if (!matchId || !backupId) return NextResponse.json({ error: "missing matchId/backupId" }, { status: 400 });
  if (!MATCHES.find(m => m.id === matchId)) return NextResponse.json({ error: "match not found" }, { status: 404 });

  const { db } = getAdmin();
  const backupSnap = await db.collection("match_results_history").doc(backupId).get();
  if (!backupSnap.exists) return NextResponse.json({ error: "backup not found" }, { status: 404 });
  const backup = backupSnap.data() as any;
  if (backup.matchId !== matchId) return NextResponse.json({ error: "backup mismatch" }, { status: 400 });

  const ref = db.collection("match_results").doc(matchId);

  /* Snapshot the current state before restoring, so the restore itself can
   * be undone from the same history list. */
  const current = await ref.get();
  if (current.exists) {
    await db.collection("match_results_history").add({
      ...current.data(),
      matchId,
      backedUpAt: Date.now(),
      backedUpBy: decoded.email || null,
      action: "before-restore",
    });
  }

  const { backedUpAt, backedUpBy, action, id, ...data } = backup;
  await ref.set(data, { merge: false });

  return NextResponse.json({ ok: true });
}
