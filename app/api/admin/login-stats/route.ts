import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { todayKey } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================================
 * GET /api/admin/login-stats
 *
 * Admin-only. Returns user login counts (excluding the admin's own
 * logins — see /api/auth/log-login):
 *   { total, today, date }
 * ===================================================================*/
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  if (!isAdminEmail(decoded.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { db } = getAdmin();
  const day = todayKey();
  const [totalSnap, todaySnap] = await Promise.all([
    db.collection("stats").doc("logins").get(),
    db.collection("stats").doc("logins").collection("daily").doc(day).get(),
  ]);

  const total = (totalSnap.exists ? (totalSnap.data() as any)?.total : 0) || 0;
  const today = (todaySnap.exists ? (todaySnap.data() as any)?.count : 0) || 0;

  return NextResponse.json({ total, today, date: day });
}
