import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* =====================================================================
 * POST /api/admin/sim/reset
 *
 * Resets the simulation state ONLY — without touching user data:
 *   - deletes ALL match_results
 *   - deletes ALL broadcast_overrides
 *   - disables sim_config (time-warp turned off)
 *
 * Preserves: predictions, profiles, managed_users, groups, memberships,
 * activity feed. Lighter alternative to /api/admin/sim/full-reset.
 * ===================================================================*/
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  if (!isAdminEmail(decoded.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { db } = getAdmin();
  const counts = { results: 0, overrides: 0 };

  async function wipe(coll: string, ctrKey: keyof typeof counts) {
    const snap = await db.collection(coll).get();
    let batch = db.batch();
    let ops = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      ops++; counts[ctrKey]++;
      if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();
  }

  await wipe("match_results", "results");
  await wipe("broadcast_overrides", "overrides");

  /* Disable simulation */
  await db.collection("sim_config").doc("global").set({
    enabled: false,
    updatedAt: Date.now(),
    updatedBy: decoded.email,
    resetReason: "sim-reset",
  }, { merge: true });

  return NextResponse.json({ ok: true, counts });
}
