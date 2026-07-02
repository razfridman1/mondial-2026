// מחיקת ניחושי הבוט הלא-נכונים עבור M074 (BRA/JPN) ו-M075 (GER/PAR)
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { resolve } from "path";

// טען FIREBASE_SERVICE_ACCOUNT_JSON מ-.env.local (מטפל ב-JSON מולטי-ליין)
import { readFileSync } from "fs";
const envText = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
const keyStart = envText.indexOf("FIREBASE_SERVICE_ACCOUNT_JSON=");
if (keyStart === -1) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON not found in .env.local");
const afterEq = envText.indexOf("=", keyStart) + 1;
const braceStart = envText.indexOf("{", afterEq);
let depth = 0, end = braceStart;
for (let i = braceStart; i < envText.length; i++) {
  if (envText[i] === "{") depth++;
  else if (envText[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
}
const serviceAccount = JSON.parse(envText.slice(braceStart, end + 1));
const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

const MATCH_IDS = ["M074", "M075"];

for (const matchId of MATCH_IDS) {
  const snap = await db.collection("predictions")
    .where("matchId", "==", matchId)
    .where("auto", "==", true)
    .get();

  console.log(`${matchId}: נמצאו ${snap.docs.length} ניחושי בוט`);
  for (const doc of snap.docs) {
    await doc.ref.delete();
    console.log(`  נמחק: ${doc.id}`);
  }
}

console.log("✅ סיום");
process.exit(0);
