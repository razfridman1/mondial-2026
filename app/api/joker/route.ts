import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken } from "@/lib/firebase-admin";
import { JOKER_LIMITS, JOKER_COOLDOWN_MS, type JokerUsage } from "@/lib/joker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/joker — current joker availability for the authenticated user */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const { db } = getAdmin();
  const snap = await db.collection("joker_usage").doc(decoded.uid).get();
  const usage = (snap.data() as JokerUsage) || { perStage: {}, lastUsedAt: 0 };
  const now = Date.now();
  const cooldownLeftMs = Math.max(0, JOKER_COOLDOWN_MS - (now - (usage.lastUsedAt || 0)));

  const remaining: Record<string, number> = {};
  Object.entries(JOKER_LIMITS).forEach(([stage, limit]) => {
    const used = usage.perStage[stage as keyof typeof JOKER_LIMITS] || 0;
    remaining[stage] = Math.max(0, limit - used);
  });

  return NextResponse.json({ usage, remaining, cooldownLeftMs });
}
