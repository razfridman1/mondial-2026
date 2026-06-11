import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebase-admin";
import { todayKey } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================================
 * POST /api/auth/log-visit
 *
 * Called once per app load (from bootstrap() in lib/store.ts) for
 * visitors who are NOT authenticated (no Firebase session at all —
 * anonymous entries to the site). Authenticated non-admin entries are
 * counted separately by /api/auth/log-login; admins never call either
 * endpoint. No auth token is required or possible here.
 *
 * Increments the SAME Firestore counters as /api/auth/log-login, so the
 * admin-only login-stats widget reflects ALL entries to the site, even
 * before anyone has logged in:
 *   - stats/logins              { total }
 *   - stats/logins/daily/{date} { count, date }   (Israel-local date key)
 * ===================================================================*/
export async function POST() {
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
    // Best-effort — never block the app on stats logging.
  }

  return NextResponse.json({ ok: true });
}
