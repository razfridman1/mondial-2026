import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Joker feature removed. Endpoint kept as a no-op stub returning empty state
 * for backward compatibility with any cached client bundle. */
export async function GET() {
  return NextResponse.json({ usage: { perStage: {}, lastUsedAt: 0 }, remaining: {}, cooldownLeftMs: 0 });
}
