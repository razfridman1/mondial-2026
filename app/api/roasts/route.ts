import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/roasts?groupId=...&limit=30 — public read for the side feed */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId");
  const limit = Math.min(60, Number(url.searchParams.get("limit") || 30));
  const { db } = getAdmin();

  let q: FirebaseFirestore.Query = db.collection("roasts").orderBy("ts", "desc").limit(limit);
  if (groupId) q = db.collection("roasts").where("groupId", "==", groupId).orderBy("ts", "desc").limit(limit);

  const snap = await q.get();
  return NextResponse.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}
