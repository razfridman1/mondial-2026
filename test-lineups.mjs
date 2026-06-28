// test-lineups.mjs — run: node test-lineups.mjs
// Checks if API_FOOTBALL_KEY works for lineups
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dir, ".env.local"), "utf8");
const env = {};
for (const line of envFile.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx < 0) continue;
  const key = trimmed.slice(0, idx).trim();
  const val = trimmed.slice(idx + 1).trim();
  if (!val.includes("{")) env[key] = val;
}

const AF_KEY = env.API_FOOTBALL_KEY;
const AF_HOST = env.API_FOOTBALL_HOST || "v3.football.api-sports.io";
const BASE = "https://" + AF_HOST.replace(/^https?:\/\//, "").replace(/\/$/, "");

console.log("API_FOOTBALL_KEY:", AF_KEY ? AF_KEY.slice(0,8) + "..." : "❌ MISSING");
console.log("Host:", BASE);

if (!AF_KEY) { console.error("\n❌ API_FOOTBALL_KEY not found in .env.local"); process.exit(1); }

const headers = { "x-apisports-key": AF_KEY, "Accept": "application/json" };

// 1. Check fixtures
console.log("\n🔍 Fetching WC 2026 fixtures...");
const r1 = await fetch(`${BASE}/fixtures?league=1&season=2026`, { headers });
console.log("Status:", r1.status);
const d1 = await r1.json();
const total = d1?.response?.length ?? 0;
console.log(`Found ${total} fixtures`);

if (total === 0) { console.error("❌ No fixtures — check key or league ID"); process.exit(1); }

// Find upcoming fixtures (next 2 days)
const now = Date.now();
const upcoming = (d1.response || [])
  .filter(f => {
    const t = new Date(f.fixture.date).getTime();
    return t > now - 2*60*60*1000 && t < now + 48*60*60*1000;
  })
  .slice(0, 3);

console.log("\n📅 Upcoming/current matches:");
for (const f of upcoming) {
  console.log(`  ${f.fixture.id} | ${f.teams.home.name} vs ${f.teams.away.name} | ${f.fixture.date} | ${f.fixture.status.short}`);
}

// Try lineups for first upcoming fixture
if (upcoming.length > 0) {
  const fid = upcoming[0].fixture.id;
  console.log(`\n⚽ Fetching lineups for fixture ${fid}...`);
  const r2 = await fetch(`${BASE}/fixtures/lineups?fixture=${fid}`, { headers });
  console.log("Status:", r2.status);
  const d2 = await r2.json();
  const lineups = d2?.response ?? [];
  if (lineups.length >= 2) {
    console.log(`✅ Lineups found! ${lineups[0].team.name} (${lineups[0].startXI.length} players) vs ${lineups[1].team.name} (${lineups[1].startXI.length} players)`);
  } else if (lineups.length === 1) {
    console.log("⚠️ Only 1 team lineup published so far");
  } else {
    console.log("⚠️ No lineups published yet for this fixture");
  }
} else {
  console.log("\nℹ️ No upcoming matches in next 48h to test lineups");
}

console.log("\n✅ API key works!");
