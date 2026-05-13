import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* =====================================================================
 * GET /api/admin/backup
 * Returns a full JSON dump of every collection an admin needs to back up.
 * Designed to be downloaded as a single file and stored offline / in git.
 *
 *  Auth: Bearer token of a super-admin (raz.fridman1@gmail.com or ADMIN_EMAILS).
 * ===================================================================*/

const COLLECTIONS = [
  "profiles",
  "managed_users",
  "username_lookup",
  "predictions",
  "match_results",
  "groups",
  "group_memberships",
  "joker_usage",
  "broadcast_overrides",
  "sim_config",
  "activity",
  "roasts",
];

export async function GET(req: Request) {
  /* Auth */
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  if (!isAdminEmail(decoded.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { db } = getAdmin();
  const out: Record<string, any> = {
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: decoded.email,
    counts: {},
  };

  for (const coll of COLLECTIONS) {
    try {
      const snap = await db.collection(coll).get();
      out[coll] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      out.counts[coll] = snap.size;
    } catch (e: any) {
      out[coll] = { error: e.message };
    }
  }

  return NextResponse.json(out);
}
