import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function gen(n = 6) {
  return Math.random().toString(36).slice(2, 2 + n).toUpperCase();
}

async function authed(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  return verifyIdToken(m[1]);
}

/* POST /api/groups  { name, description? }  → create group */
export async function POST(req: Request) {
  let u;
  try { u = await authed(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }
  const { name, description } = await req.json();
  if (!name || typeof name !== "string") return NextResponse.json({ error: "missing name" }, { status: 400 });

  const { db } = getAdmin();
  const inviteCode = gen();
  const groupRef = db.collection("groups").doc();
  const now = Date.now();

  await groupRef.set({
    name: name.slice(0, 60),
    description: (description || "").slice(0, 240),
    ownerUid: u.uid,
    ownerName: u.email,
    inviteCode,
    createdAt: now,
    memberCount: 1,
  });
  await db.collection("group_memberships").doc(`${u.uid}_${groupRef.id}`).set({
    uid: u.uid, groupId: groupRef.id, joinedAt: now, role: "owner",
  });
  return NextResponse.json({ id: groupRef.id, inviteCode });
}

/* GET /api/groups?invite=CODE  → lookup by invite code */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const invite = url.searchParams.get("invite");
  if (!invite) return NextResponse.json({ error: "missing invite" }, { status: 400 });
  const { db } = getAdmin();
  const snap = await db.collection("groups").where("inviteCode", "==", invite).limit(1).get();
  if (snap.empty) return NextResponse.json({ error: "not found" }, { status: 404 });
  const d = snap.docs[0];
  return NextResponse.json({ id: d.id, ...d.data() });
}
