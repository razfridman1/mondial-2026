import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";

// Read .env.local manually
const env = readFileSync(".env.local", "utf8");
const get = (key) => {
  const idx = env.indexOf(`${key}=`);
  if (idx === -1) return undefined;
  let val = env.slice(idx + key.length + 1);
  // If wrapped in single quotes (possibly multiline), extract until closing quote
  if (val.startsWith("'")) {
    const end = val.indexOf("'", 1);
    return end === -1 ? val.slice(1).trim() : val.slice(1, end).trim();
  }
  // Otherwise single line
  return val.split("\n")[0].trim().replace(/^"|"$/g, "");
};

const sa = JSON.parse(get("FIREBASE_SERVICE_ACCOUNT_JSON"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const scorers = [
  { name: "ליונל מסי",          teamCode: "ARG", count: 6 },
  { name: "קיליאן אמבפה",       teamCode: "FRA", count: 4 },
  { name: "וסמאן דמבלה",        teamCode: "FRA", count: 4 },
  { name: "ויניסיוס ז'וניור",   teamCode: "BRA", count: 4 },
  { name: "ארלינג הולאנד",      teamCode: "NOR", count: 4 },
  { name: "דניז אונדב",         teamCode: "GER", count: 3 },
  { name: "יוהאן מנזמבי",       teamCode: "SUI", count: 3 },
  { name: "ישמעיל סאר",         teamCode: "SEN", count: 3 },
  { name: "בריאן ברובי",        teamCode: "NED", count: 3 },
  { name: "מתאוס קונייה",       teamCode: "BRA", count: 3 },
];

const assists = [
  { name: "ברונו גימאריש",      teamCode: "BRA", count: 3 },
  { name: "מייקל אוליז",        teamCode: "FRA", count: 3 },
  { name: "אלכסנדר איסאק",      teamCode: "SWE", count: 3 },
  { name: "ברהאים דיאז",        teamCode: "MAR", count: 2 },
  { name: "כריס וואוד",         teamCode: "NZL", count: 2 },
  { name: "ויקטור גיוקרס",      teamCode: "SWE", count: 2 },
  { name: "קיליאן אמבפה",       teamCode: "FRA", count: 2 },
  { name: "בוקאיו סאקה",        teamCode: "ENG", count: 2 },
  { name: "יושוע קימיך",        teamCode: "GER", count: 2 },
  { name: "דניז אונדב",         teamCode: "GER", count: 2 },
];

await db.collection("live_data").doc("cached_scorers").set({
  scorers, assists,
  manualOverride: true,
  updatedAt: Date.now(),
  setByAdmin: true,
});

console.log("✅ Done");
process.exit(0);
