import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const { inviteCode } = await req.json();
  if (!inviteCode) return NextResponse.json({ error: "missing inviteCode" }, { status: 400 });

  const { db } = getAdmin();
  const snap = await db.collection("groups").where("inviteCode", "==", inviteCode).limit(1).get();
  if (snap.empty) return NextResponse.json({ error: "group not found" }, { status: 404 });
  const g = snap.docs[0];
  const memId = `${decoded.uid}_${g.id}`;
  const memRef = db.collection("group_memberships").doc(memId);
  const existing = await memRef.get();
  if (existing.exists) {
    const data = existing.data() as any;
    if (data.left) {
      /* Previously left → rejoin and bump memberCount back up. */
      await memRef.update({ left: false, leftAt: null, rejoinedAt: Date.now() });
      await g.ref.update({ memberCount: (g.data().memberCount || 0) + 1 });
      return NextResponse.json({ ok: true, groupId: g.id, rejoined: true });
    }
    return NextResponse.json({ ok: true, groupId: g.id, alreadyMember: true });
  }
  await memRef.set({ uid: decoded.uid, groupId: g.id, joinedAt: Date.now(), role: "member" });
  await g.ref.update({ memberCount: (g.data().memberCount || 1) + 1 });

  // Activity event
  await db.collection("activity").add({
    kind: "group.joined",
    uid: decoded.uid,
    displayName: decoded.email,
    avatarId: "messi",
    groupId: g.id,
    ts: Date.now(),
  });

  return NextResponse.json({ ok: true, groupId: g.id });
}
