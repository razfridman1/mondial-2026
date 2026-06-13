import { NextResponse } from "next/server";
import { runResultsSync } from "@/lib/sync-results-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* =====================================================================
 * GET /api/cron/sync-results
 *
 * Thin wrapper: authenticates the Vercel Cron request (CRON_SECRET) and
 * delegates to lib/sync-results-core.ts, which also powers a redundant
 * trigger from app/api/match-results/route.ts (used when the cron itself
 * doesn't run/fail — see that file for details).
 * ===================================================================*/

const SECRET = process.env.CRON_SECRET || "";

export async function GET(req: Request) {
  if (SECRET) {
    const auth = req.headers.get("authorization") || "";
    if (!auth.endsWith(SECRET)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const result = await runResultsSync({ force });
  const { status, ...payload } = result;
  return NextResponse.json(payload, { status: status || 200 });
}
