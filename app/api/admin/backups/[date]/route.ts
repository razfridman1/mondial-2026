import { NextResponse } from "next/server";
import { verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { loadFullBackup } from "@/lib/backup";

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

/* GET /api/admin/backups/[date] — reassemble and return one full daily
 * backup (every collection, every document) for download as JSON. */
export async function GET(req: Request, { params }: { params: Promise<{ date: string }> }) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "invalid date" }, { status: 400 });
  const { summary, data } = await loadFullBackup(date);
  if (!summary) return NextResponse.json({ error: "backup not found" }, { status: 404 });
  return NextResponse.json({ summary, ...data });
}
