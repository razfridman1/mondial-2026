import { NextResponse } from "next/server";
import { verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { listBackups } from "@/lib/backup";

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

/* GET /api/admin/backups — list all available daily full-site backups,
 * newest first (date, size, who/when triggered). */
export async function GET(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const list = await listBackups();
  return NextResponse.json(list);
}
