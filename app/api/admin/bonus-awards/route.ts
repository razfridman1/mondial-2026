import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================================
 * Bonus Awards — manual point adjustments by super admin.
 *
 *   Collection: bonus_awards
 *   Doc shape: { uid, points (signed int), reason, awardedBy, awardedAt }
 *
 *   The leaderboard sums all bonuses per user and adds to totalPoints.
 *   Negative values are allowed (deductions).
 * ===================================================================*/

async function authedAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const decoded = await verifyIdToken(m[1]);
  if (!isAdminEmail(decoded.email)) throw Object.assign(new Error("forbidden"), { status: 403 });
  return decoded;
}

/* GET /api/admin/bonus-awards[?uid=...] — list all awards or for one user */
export async function GET(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const url = new URL(req.url);
  const uid = url.searchParams.get("uid");
  const { db } = getAdmin();
  let q: FirebaseFirestore.Query = db.collection("bonus_awards").orderBy("awardedAt", "desc");
  if (uid) q = db.collection("bonus_awards").where("uid", "==", uid).orderBy("awardedAt", "desc");
  const snap = await q.get();
  return NextResponse.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

/* POST /api/admin/bonus-awards { uid, points, reason? } */
export async function POST(req: Request) {
  let admin;
  try { admin = await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const body = await req.json().catch(() => ({}));
  const uid = body.uid;
  const points = Number(body.points);
  const reason = (body.reason || "").toString().slice(0, 240);

  if (!uid) return NextResponse.json({ error: "missing uid" }, { status: 400 });
  if (!Number.isFinite(points) || points === 0) {
    return NextResponse.json({ error: "points must be a non-zero number" }, { status: 400 });
  }
  if (Math.abs(points) > 10000) {
    return NextResponse.json({ error: "points magnitude too large (max ±10,000)" }, { status: 400 });
  }

  const { db } = getAdmin();
  const ref = db.collection("bonus_awards").doc();
  await ref.set({
    uid,
    points: Math.round(points),
    reason,
    awardedBy: admin.email,
    awardedAt: Date.now(),
  });
  return NextResponse.json({ ok: true, id: ref.id });
}

/* DELETE /api/admin/bonus-awards { id } */
export async function DELETE(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const body = await req.json().catch(() => ({}));
  const id = body.id;
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { db } = getAdmin();
  await db.collection("bonus_awards").doc(id).delete();
  return NextResponse.json({ ok: true, deleted: id });
}
