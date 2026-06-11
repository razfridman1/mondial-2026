import { NextResponse } from "next/server";
import { verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { runFullBackup } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SECRET = process.env.CRON_SECRET || "";

/* GET /api/cron/daily-backup
 * Runs the daily full-site backup (writes backups/{today} + chunks,
 * prunes old backups). Called by the Vercel cron, but also safe to call
 * manually:
 *  - with `Authorization: Bearer <CRON_SECRET>` (if CRON_SECRET is set), or
 *  - with `Authorization: Bearer <admin idToken>` (used by the "גיבוי עכשיו"
 *    button in Super Admin).
 */
async function handle(req: Request) {
  const auth = req.headers.get("authorization") || "";
  let triggeredBy: string | null = "cron";

  if (SECRET && auth.endsWith(SECRET)) {
    triggeredBy = "cron";
  } else {
    const m = auth.match(/^Bearer (.+)$/);
    if (!m) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    try {
      const decoded = await verifyIdToken(m[1]);
      if (!isAdminEmail(decoded.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      triggeredBy = decoded.email || "admin";
    } catch {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  try {
    const summary = await runFullBackup(triggeredBy);
    return NextResponse.json({ ok: true, ...summary });
  } catch (e: any) {
    return NextResponse.json({ error: "backup_failed", message: e?.message || String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
