import { NextResponse } from "next/server";
import { verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { restoreCollection, BACKUP_COLLECTIONS } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authedAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const decoded = await verifyIdToken(m[1]);
  if (!isAdminEmail(decoded.email)) throw Object.assign(new Error("forbidden"), { status: 403 });
  return decoded;
}

/* POST /api/admin/backups/restore { dateKey, collection, exact? }
 *
 * Restores ONE collection from a previous daily backup, writing back the
 * REAL documents that existed at backup time (set, merge:false per doc).
 *
 *  - exact=false (default): writes back every backed-up doc; live docs not
 *    in the backup are left untouched.
 *  - exact=true: ALSO deletes live docs that don't exist in the backup —
 *    a full revert of the collection to that point in time.
 *
 * Admin-only, destructive — the UI must confirm with the user before
 * calling this. */
export async function POST(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const body = await req.json().catch(() => ({}));
  const { dateKey, collection, exact } = body || {};
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return NextResponse.json({ error: "invalid dateKey" }, { status: 400 });
  if (!collection || !BACKUP_COLLECTIONS.includes(collection)) return NextResponse.json({ error: "invalid collection" }, { status: 400 });

  try {
    const result = await restoreCollection(dateKey, collection, !!exact);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: "restore_failed", message: e?.message || String(e) }, { status: 500 });
  }
}
