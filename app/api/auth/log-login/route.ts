import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { todayKey } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================================
 * POST /api/auth/log-login
 *
 * Called once per app load (from bootstrap()'s watchAuth callback in
 * lib/store.ts) right after a user is authenticated — whether via a
 * fresh sign-in or a restored session. Every call counts as one "login",
 * even if the same user re-enters the app multiple times.
 *
 * Increments simple Firestore counters used by the admin-only
 * login-stats widget on the profile page:
 *   - stats/logins              { total }
 *   - stats/logins/daily/{date} { count, date }   (Israel-local date key)
 *
 * The admin's own logins (raz.fridman1@gmail.com / ADMIN_EMAILS) are
 * intentionally NOT counted.
 * ===================================================================*/
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 401 }); }

  if (isAdminEmail(decoded.email)) {
    return NextResponse.json({ ok: true, counted: false });
  }

  try {
    const { db } = getAdmin();
    const day = todayKey();
    await Promise.all([
      db.collection("stats").doc("logins").set(
        { total: FieldValue.increment(1), updatedAt: Date.now() },
        { merge: true }
      ),
      db.collection("stats").doc("logins").collection("daily").doc(day).set(
        { count: FieldValue.increment(1), date: day, updatedAt: Date.now() },
        { merge: true }
      ),
    ]);
  } catch {
    // Best-effort — never block the login flow on stats logging.
  }

  return NextResponse.json({ ok: true, counted: true });
}
