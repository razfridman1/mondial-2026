import { NextResponse } from "next/server";
import { getAdmin, verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { computeSpecialPickActuals, normalizePickName } from "@/lib/special-picks-bonus";
import { TEAMS } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* =====================================================================
 * POST /api/admin/final-score
 *
 * "ניקוד סופי" — the one-click action behind the button in שליטה מלאה.
 * Awards the 12-pt special-pick bonus (via the same `bonus_awards`
 * collection the leaderboard already reads) to every user who correctly
 * guessed:
 *   1. המנצחת במונדיאל  — the FINAL match winner (profile.championPick)
 *   2. מלך השערים        — the tournament's actual top scorer (profile.topScorerPick)
 *   3. מלך הבישולים      — the tournament's actual top assist (profile.topAssistPick)
 *
 * Idempotent by design — each (uid, category) gets a deterministic doc id
 * (`finalscore_{uid}_{category}`), so clicking the button again:
 *   - does nothing for picks that were already awarded and are still correct
 *   - awards picks that just became decidable (e.g. top scorer known before
 *     the final is played)
 *   - removes a bonus if the underlying result was corrected and the pick
 *     is no longer correct
 * This means the admin can safely press the button at any point in the
 * tournament, and again after the final, without ever double-awarding.
 * ===================================================================*/

async function authedAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const decoded = await verifyIdToken(m[1]);
  if (!isAdminEmail(decoded.email)) throw Object.assign(new Error("forbidden"), { status: 403 });
  return decoded;
}

const CATEGORIES = [
  { key: "champion", label: "👑 המנצחת במונדיאל" },
  { key: "scorer",   label: "⚽ מלך השערים" },
  { key: "assist",   label: "🍳 מלך הבישולים" },
] as const;
const POINTS_PER_CATEGORY = 12;

export async function POST(req: Request) {
  let admin;
  try { admin = await authedAdmin(req); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: e.status || 401 }); }

  const { db } = getAdmin();

  /* Ground truth: FINAL winner + actual top scorer/assist from live goal data. */
  const resSnap = await db.collection("match_results").get();
  const results: Record<string, { home?: number; away?: number; winner?: string }> = {};
  resSnap.forEach(d => {
    const data = d.data() as any;
    results[d.id] = { home: data.home, away: data.away, winner: data.winner };
  });
  const actuals = await computeSpecialPickActuals(db, results);

  /* Every user's picks */
  const profSnap = await db.collection("profiles").get();

  /* Existing auto-awarded docs from a previous run of this same action —
   * lets us tell "already awarded, nothing to do" apart from "needs a new
   * write", and clean up bonuses that are no longer correct. */
  const existingSnap = await db.collection("bonus_awards").where("auto", "==", true).get();
  const existingIds = new Set(existingSnap.docs.map(d => d.id));

  const currentlyCorrect: Record<string, string[]> = {}; // uid -> category labels, true state after this run
  let newlyAwarded = 0;
  let removed = 0;
  let batch = db.batch();
  let ops = 0;

  async function flushIfNeeded() {
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  for (const doc of profSnap.docs) {
    const uid = doc.id;
    const data = doc.data() as any;

    const isCorrect: Record<string, boolean> = {
      champion: !!(actuals.actualChampion && data.championPick?.teamCode === actuals.actualChampion),
      scorer: !!(
        data.topScorerPick && actuals.topScorerNorm.length &&
        actuals.topScorerNorm.includes(normalizePickName(data.topScorerPick.playerName))
      ),
      assist: !!(
        data.topAssistPick && actuals.topAssistNorm.length &&
        actuals.topAssistNorm.includes(normalizePickName(data.topAssistPick.playerName))
      ),
    };

    for (const cat of CATEGORIES) {
      const docId = `finalscore_${uid}_${cat.key}`;
      const exists = existingIds.has(docId);

      if (isCorrect[cat.key]) {
        (currentlyCorrect[uid] ||= []).push(cat.label);
        if (!exists) {
          batch.set(db.collection("bonus_awards").doc(docId), {
            uid,
            points: POINTS_PER_CATEGORY,
            reason: `${cat.label} — ניחוש נכון (ניקוד סופי)`,
            awardedBy: admin.email,
            awardedAt: Date.now(),
            auto: true,
            category: cat.key,
          });
          ops++;
          newlyAwarded++;
          await flushIfNeeded();
        }
      } else if (exists) {
        batch.delete(db.collection("bonus_awards").doc(docId));
        ops++;
        removed++;
        await flushIfNeeded();
      }
    }
  }
  if (ops > 0) await batch.commit();

  const profByUid = new Map(profSnap.docs.map(d => [d.id, d.data() as any]));
  const awarded = Object.entries(currentlyCorrect).map(([uid, categories]) => ({
    uid,
    displayName: profByUid.get(uid)?.displayName || uid.slice(0, 10),
    categories,
    points: categories.length * POINTS_PER_CATEGORY,
  }));
  awarded.sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName, "he"));

  /* Diagnostic: for every profile that HAS a scorer/assist pick, show the
   * raw stored string next to its normalized form and whether it matched
   * — makes formatting mismatches (extra space, different apostrophe, HE
   * vs EN spelling) visible instead of a silent "not awarded". */
  const debugPicks: Array<{ uid: string; displayName: string; category: "scorer" | "assist";
    raw: string; norm: string; matched: boolean }> = [];
  for (const doc of profSnap.docs) {
    const uid = doc.id;
    const data = doc.data() as any;
    const displayName = data.displayName || uid.slice(0, 10);
    if (data.topScorerPick?.playerName) {
      const raw = data.topScorerPick.playerName;
      const norm = normalizePickName(raw);
      debugPicks.push({ uid, displayName, category: "scorer", raw, norm, matched: actuals.topScorerNorm.includes(norm) });
    }
    if (data.topAssistPick?.playerName) {
      const raw = data.topAssistPick.playerName;
      const norm = normalizePickName(raw);
      debugPicks.push({ uid, displayName, category: "assist", raw, norm, matched: actuals.topAssistNorm.includes(norm) });
    }
  }

  return NextResponse.json({
    ok: true,
    actualChampion: actuals.actualChampion,
    actualChampionName: actuals.actualChampion ? (TEAMS as any)[actuals.actualChampion]?.name || actuals.actualChampion : null,
    topScorerNames: actuals.topScorerNames,
    topScorerNorm: actuals.topScorerNorm,
    topAssistNames: actuals.topAssistNames,
    topAssistNorm: actuals.topAssistNorm,
    awarded,
    usersAwarded: awarded.length,
    newlyAwarded,
    removed,
    debugPicks,
  });
}
