import { NextResponse } from "next/server";
import { fdGetRaw } from "@/lib/footballdata-io";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================================
 * GET /api/admin/footballdata-debug?action=...
 *
 * One-off introspection tool for footballdata.io — used to discover the
 * World Cup 2026 league_id / season_id, list its matches (with
 * footballdata.io match_ids), and inspect the raw shape of the /odds
 * endpoint for a real match. Once we know these, we can build the
 * match_id mapping + odds sync cron.
 *
 * Auth: same as other admin/cron routes — if CRON_SECRET is set, the
 * Authorization header must end with it.
 *
 * Actions:
 *   ?action=search&q=World+Cup       -> GET /search?q=...
 *   ?action=leagues                  -> GET /leagues?limit=100
 *   ?action=seasons&league_id=123    -> GET /leagues/{id}/seasons
 *   ?action=matches&season_id=456    -> GET /seasons/{id}/matches?limit=100
 *   ?action=match&id=789             -> GET /matches/{id}
 *   ?action=odds&id=789              -> GET /matches/{id}/odds
 *   ?action=usage                    -> GET /account/usage
 * ===================================================================*/
const SECRET = process.env.CRON_SECRET || "";

export async function GET(req: Request) {
  if (SECRET) {
    const auth = req.headers.get("authorization") || "";
    if (!auth.endsWith(SECRET)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  if (!process.env.FOOTBALLDATA_IO_API_KEY) {
    return NextResponse.json({ error: "FOOTBALLDATA_IO_API_KEY not configured" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") || "usage";

  let path: string;
  switch (action) {
    case "search": {
      const q = searchParams.get("q") || "World Cup";
      path = `/search?q=${encodeURIComponent(q)}`;
      break;
    }
    case "leagues":
      path = `/leagues?limit=100`;
      break;
    case "seasons": {
      const leagueId = searchParams.get("league_id");
      if (!leagueId) return NextResponse.json({ error: "league_id required" }, { status: 400 });
      path = `/leagues/${leagueId}/seasons`;
      break;
    }
    case "matches": {
      const seasonId = searchParams.get("season_id");
      if (!seasonId) return NextResponse.json({ error: "season_id required" }, { status: 400 });
      const page = searchParams.get("page") || "1";
      path = `/seasons/${seasonId}/matches?page=${page}&limit=100`;
      break;
    }
    case "match": {
      const id = searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      path = `/matches/${id}`;
      break;
    }
    case "odds": {
      const id = searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      path = `/matches/${id}/odds`;
      break;
    }
    case "usage":
    default:
      path = `/account/usage`;
      break;
  }

  const result = await fdGetRaw(path);
  return NextResponse.json({ action, path, ...result });
}
