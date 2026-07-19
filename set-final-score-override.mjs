/**
 * set-final-score-override.mjs — manually pin the "actual" top scorer /
 * top assist used by the admin "ניקוד סופי" button, bypassing the FIFA
 * scrape (live_data/fifa_scorers|fifa_assists) and the match_goals
 * fallback. Useful when the scraped leaderboard is stale/broken but you
 * already know who's leading.
 *
 * Usage:
 *   node set-final-score-override.mjs --scorer "קיליאן אמבפה,Kylian Mbappé"
 *   node set-final-score-override.mjs --assist "מייקל אוליסה,Michael Olise"
 *   node set-final-score-override.mjs --champion ESP
 *   node set-final-score-override.mjs --scorer "..." --assist "..." --champion ESP
 *   node set-final-score-override.mjs --clear-scorer
 *   node set-final-score-override.mjs --clear-assist
 *   node set-final-score-override.mjs --clear-champion
 *
 * Pass every name variant you can think of (Hebrew + English spelling) —
 * whichever one matches a user's actual stored pick wins. --champion takes
 * a team code (ESP, FRA, ARG, ...) matching lib/data.ts TEAMS. After
 * running this, go press "ניקוד סופי" in the admin panel to award/re-award
 * points to everyone whose pick matches.
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const get = (key) => {
  const idx = env.indexOf(`${key}=`);
  if (idx === -1) return undefined;
  let val = env.slice(idx + key.length + 1);
  if (val.startsWith("'")) {
    const end = val.indexOf("'", 1);
    return end === -1 ? val.slice(1).trim() : val.slice(1, end).trim();
  }
  return val.split("\n")[0].trim().replace(/^"|"$/g, "");
};

const sa = JSON.parse(get("FIREBASE_SERVICE_ACCOUNT_JSON"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

const scorerArg = argVal("--scorer");
const assistArg = argVal("--assist");
const championArg = argVal("--champion");
const clearScorer = process.argv.includes("--clear-scorer");
const clearAssist = process.argv.includes("--clear-assist");
const clearChampion = process.argv.includes("--clear-champion");

if (!scorerArg && !assistArg && !championArg && !clearScorer && !clearAssist && !clearChampion) {
  console.log("Usage: node set-final-score-override.mjs --scorer \"name1,name2\" --assist \"name1,name2\" --champion ESP");
  console.log("       node set-final-score-override.mjs --clear-scorer | --clear-assist | --clear-champion");
  process.exit(1);
}

const ref = db.collection("live_data").doc("final_score_override");
const snap = await ref.get();
const current = snap.exists ? (snap.data() || {}) : {};
const patch = {};

if (scorerArg) {
  const names = scorerArg.split(",").map(s => s.trim()).filter(Boolean);
  patch.scorer = { names, setAt: new Date().toISOString(), setBy: "manual" };
  console.log("Setting scorer override:", names);
}
if (clearScorer) {
  patch.scorer = null;
  console.log("Clearing scorer override");
}
if (assistArg) {
  const names = assistArg.split(",").map(s => s.trim()).filter(Boolean);
  patch.assist = { names, setAt: new Date().toISOString(), setBy: "manual" };
  console.log("Setting assist override:", names);
}
if (clearAssist) {
  patch.assist = null;
  console.log("Clearing assist override");
}
if (championArg) {
  const teamCode = championArg.trim().toUpperCase();
  patch.champion = { teamCode, setAt: new Date().toISOString(), setBy: "manual" };
  console.log("Setting champion override:", teamCode);
}
if (clearChampion) {
  patch.champion = null;
  console.log("Clearing champion override");
}

await ref.set({ ...current, ...patch }, { merge: false });
console.log("✅ Done. Now go press \"ניקוד סופי\" in the admin panel to award points.");
