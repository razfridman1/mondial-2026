import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { MATCHES } from "@/lib/data";
import type { StageId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORDER: StageId[] = ["GROUP", "R32", "R16", "QF", "SF", "THIRD", "FINAL"];

/* GET /api/admin/sim/status?groupId=XXX
 *
 * Returns the simulation progress per stage:
 *   - predictions filled (count of saved predictions × group members × stage matches)
 *   - results filled (how many of the stage's matches have a result doc)
 *   - totals (expected counts)
 *
 * Used by the new stage-by-stage simulation panel to gate buttons. */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let decoded;
  try { decoded = await verifyIdToken(m[1]); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  if (!isAdminEmail(decoded.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId");

  const { db } = getAdmin();

  /* Resolve member UIDs of the selected group (active only — no left). */
  let memberUids: string[] = [];
  if (groupId) {
    const memSnap = await db.collection("group_memberships").where("groupId", "==", groupId).get();
    memberUids = memSnap.docs
      .filter(d => !(d.data() as any).left)
      .map(d => (d.data() as any).uid as string);
  }

  /* Match IDs per stage. */
  const stageMatchIds: Record<StageId, string[]> = {} as any;
  for (const s of ORDER) {
    stageMatchIds[s] = MATCHES.filter(m => m.stage === s).map(m => m.id);
  }

  /* Load existing match_results. */
  const resSnap = await db.collection("match_results").get();
  const resultIds = new Set(resSnap.docs.map(d => d.id));

  /* Load predictions only for the chosen group's members. */
  const predIdsByStage: Record<StageId, Set<string>> = {} as any;
  for (const s of ORDER) predIdsByStage[s] = new Set<string>();

  if (memberUids.length) {
    /* Firestore `in` supports up to 30 values — chunk if needed. */
    for (let i = 0; i < memberUids.length; i += 30) {
      const chunk = memberUids.slice(i, i + 30);
      const snap = await db.collection("predictions").where("uid", "in", chunk).get();
      for (const d of snap.docs) {
        const data = d.data() as any;
        const stage = MATCHES.find(m => m.id === data.matchId)?.stage as StageId | undefined;
        if (!stage) continue;
        predIdsByStage[stage].add(d.id); // doc id = uid_matchId, unique
      }
    }
  }

  const memberCount = memberUids.length;
  const stages = ORDER.map(s => {
    const matchIds = stageMatchIds[s];
    const resultsFilled = matchIds.filter(id => resultIds.has(id)).length;
    const predictionsFilled = predIdsByStage[s].size;
    const predictionsTotal = memberCount * matchIds.length;
    return {
      stage: s,
      matchesTotal: matchIds.length,
      resultsFilled,
      predictionsFilled,
      predictionsTotal,
    };
  });

  return NextResponse.json({
    ok: true,
    groupId,
    memberCount,
    stages,
  });
}
