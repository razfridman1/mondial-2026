import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";

export const runtime = "nodejs";

async function authedAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const decoded = await verifyIdToken(m[1]);
  if (!isAdminEmail(decoded.email)) throw Object.assign(new Error("forbidden"), { status: 403 });
  return decoded;
}

/* DELETE /api/admin/activity { id? | uid? | matchId? | all? } */
export async function DELETE(req: Request) {
  try { await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const body = await req.json().catch(() => ({}));
  const { db } = getAdmin();

  if (body.id) {
    await db.collection("activity").doc(body.id).delete();
    return NextResponse.json({ ok: true, deleted: 1 });
  }
  if (body.all) {
    const snap = await db.collection("activity").get();
    await Promise.all(snap.docs.map(d => d.ref.delete()));
    return NextResponse.json({ ok: true, deleted: snap.size });
  }
  let q: FirebaseFirestore.Query = db.collection("activity");
  if (body.uid)     q = q.where("uid", "==", body.uid);
  if (body.matchId) q = q.where("matchId", "==", body.matchId);
  if (body.groupId) q = q.where("groupId", "==", body.groupId);
  const snap = await q.get();
  await Promise.all(snap.docs.map(d => d.ref.delete()));
  return NextResponse.json({ ok: true, deleted: snap.size });
}
