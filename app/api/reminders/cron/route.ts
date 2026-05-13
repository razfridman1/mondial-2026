import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Email reminders feature was removed. This endpoint is kept as a no-op
 * stub so any stale Vercel cron / external pinger doesn't 404. */
export async function GET() {
  return NextResponse.json({ ok: true, status: "email_reminders_removed", sent: 0 });
}
