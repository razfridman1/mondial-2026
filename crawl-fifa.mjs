/**
 * crawl-fifa.mjs — FIFA.com Playwright crawler
 *
 * Setup (once):
 *   npm install -D playwright
 *   npx playwright install chromium
 *
 * Usage:
 *   node crawl-fifa.mjs                    — run all
 *   node crawl-fifa.mjs --only scorers
 *   node crawl-fifa.mjs --only assists
 *   node crawl-fifa.mjs --only fixtures
 *   node crawl-fifa.mjs --only matchcentre
 */

import { chromium } from "playwright";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";

// ── Firestore init ────────────────────────────────────────────────────────────
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

// ── URLs ──────────────────────────────────────────────────────────────────────
const BASE = "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026";
const URLS = {
  scorers:     `${BASE}/statistics/player-statistics`,
  assists:     `${BASE}/statistics/player-statistics`,
  fixtures:    `${BASE}/scores-fixtures?country=IL&wtw-filter=ALL`,
  matchcentre: "https://www.fifa.com/en/match-centre",
};

const only = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : null;

const tasks = only ? [only] : ["scorers", "assists", "fixtures", "matchcentre"];

// ── Browser ───────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  locale: "en-US",
});
const page = await ctx.newPage();

async function waitFor(sel, timeout = 20000) {
  try { await page.waitForSelector(sel, { timeout }); return true; }
  catch { return false; }
}

// ── SCORERS / ASSISTS ─────────────────────────────────────────────────────────
async function scrapePlayerStats(type) {
  console.log((type === "scorers" ? "⚽" : "🎯") + " Scraping " + type + "...");
  await page.goto(URLS[type], { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(5000);

  if (type === "assists") {
    // Try JS click on any element whose exact text is "Assists"
    const clicked = await page.evaluate(function() {
      var all = Array.from(document.querySelectorAll("button, [role='tab'], a, li, span"));
      var el = all.find(function(e) {
        return e.children.length === 0 && e.textContent.trim() === "Assists";
      });
      if (el) { el.click(); return true; }
      return false;
    });
    console.log("  Assists tab JS click:", clicked);
    if (clicked) {
      await page.waitForTimeout(4000);
    } else {
      // Playwright fallback
      try { await page.locator("text=Assists").first().click({ timeout: 3000 }); await page.waitForTimeout(3000); } catch (e) {}
    }
  }

  await waitFor("tr td.rank-column, tr td.list-cell-column", 15000);

  const results = await page.evaluate(function(statType) {
    var rows = Array.from(document.querySelectorAll("tr")).filter(function(tr) {
      return tr.querySelector("td.rank-column");
    });
    return rows.map(function(tr) {
      var rank    = tr.querySelector("span.ranking-value") ? tr.querySelector("span.ranking-value").textContent.trim() : "0";
      var nameEl  = tr.querySelector("td.list-cell-column");
      var name    = nameEl && nameEl.querySelector(".main-text") ? nameEl.querySelector(".main-text").textContent.trim() : "";
      var after   = name ? (nameEl ? nameEl.textContent.trim() : "").slice(name.length) : "";
      var tm      = after.match(/^([A-Z]{3})/);
      var team    = tm ? tm[1] : after.slice(0, 3);
      var vals    = Array.from(tr.querySelectorAll("td.scrollable-column span.value"));
      // vals[0] = Goals (always), vals[1] = Assists (always)
      var goals   = vals[0] ? vals[0].textContent.trim() : "0";
      var assists = vals[1] ? vals[1].textContent.trim() : "0";
      var value   = statType === "assists" ? assists : goals;
      return { rank: Number(rank)||0, name: name, team: team, goals: Number(goals)||0, assists: Number(assists)||0, value: Number(value)||0, displayValue: value||"0" };
    }).filter(function(r) { return r.name && r.rank > 0; });
  }, type);

  console.log("  " + type + ": " + results.length + " rows, top3:", results.slice(0, 3));
  return results;
}

// ── FIXTURES ──────────────────────────────────────────────────────────────────
async function scrapeFixtures() {
  console.log("📅 Scraping fixtures...");
  await page.goto(URLS.fixtures, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(5000);
  await waitFor("[class*='MatchCard'], [class*='match-card'], [class*='fixture'], table", 15000);

  const data = await page.evaluate(function() {
    var matches = [];
    var cards = document.querySelectorAll("[class*='MatchCard'], [class*='match-card'], [class*='fixture-card']");
    cards.forEach(function(card) {
      var teams  = Array.from(card.querySelectorAll("[class*='TeamName'], [class*='team-name']")).map(function(e) { return e.textContent.trim(); });
      var score  = card.querySelector("[class*='Score'], [class*='score']");
      var date   = card.querySelector("[class*='Date'], [class*='date'], time");
      var status = card.querySelector("[class*='Status'], [class*='status']");
      matches.push({ home: teams[0], away: teams[1], score: score ? score.textContent.trim() : null, date: date ? date.textContent.trim() : null, status: status ? status.textContent.trim() : null });
    });
    return { matches: matches };
  });

  console.log("  fixtures: " + (data.matches ? data.matches.length : 0) + " matches");
  return data;
}

// ── MATCH CENTRE (WC scores-fixtures page) ───────────────────────────────────
async function scrapeMatchCentre() {
  console.log("🏟️  Scraping WC match results...");
  const url = BASE + "/scores-fixtures";
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(6000);

  // Dismiss cookie/consent overlay
  await page.evaluate(function() {
    var sdk = document.getElementById("onetrust-consent-sdk");
    if (sdk) sdk.remove();
    var filter = document.querySelector(".onetrust-pc-dark-filter");
    if (filter) filter.remove();
  });

  // Wait for score elements
  await waitFor("[class*=match-row_score], [class*=MatchScore], [class*=match-score]", 15000);

  const matches = await page.evaluate(function() {
    // Helper: clean text
    function txt(el) { return el ? el.textContent.trim().replace(/\s+/g, " ") : ""; }

    // Find the ancestor of an element at a given depth
    function ancestor(el, depth) {
      var cur = el;
      for (var i = 0; i < depth && cur; i++) cur = cur.parentElement;
      return cur;
    }

    // Find all score spans (discovered class: match-row_score__*)
    var scoreSpans = Array.from(document.querySelectorAll("[class*=match-row_score]"));
    if (!scoreSpans.length) {
      // Fallback: try any score-looking elements near team names
      scoreSpans = Array.from(document.querySelectorAll("[class*=score__]")).filter(function(el) {
        return /^\d+$/.test(el.textContent.trim());
      });
    }

    if (!scoreSpans.length) return { matches: [], debug: "no score spans found" };

    // Group score spans by their grandparent (the score container holds home+away)
    // Walk up until we find a container that has exactly 2 score children
    var containers = new Map();
    scoreSpans.forEach(function(span) {
      var cur = span;
      for (var i = 0; i < 5 && cur; i++) {
        cur = cur.parentElement;
        if (!cur) break;
        var scores = cur.querySelectorAll ? Array.from(cur.querySelectorAll("[class*=match-row_score]")) : [];
        if (scores.length === 2) {
          var key = cur;
          if (!containers.has(key)) containers.set(key, cur);
          break;
        }
      }
    });

    var results = [];

    containers.forEach(function(scoreBox) {
      // scoreBox has exactly 2 score spans
      var scores = Array.from(scoreBox.querySelectorAll("[class*=match-row_score]"));
      var homeScore = txt(scores[0]);
      var awayScore = txt(scores[1]);

      // Walk up from scoreBox to find the full match row (contains team names)
      var matchContainer = scoreBox;
      var home = "", away = "", matchDate = "", status = "";

      for (var depth = 1; depth <= 8; depth++) {
        matchContainer = matchContainer.parentElement;
        if (!matchContainer) break;

        // Try to find team names — look for elements with "team" in class or with country/name-like text
        var teamEls = Array.from(matchContainer.querySelectorAll("[class*=team], [class*=Team], [class*=club], [class*=Club]"));
        var nameEls = teamEls.filter(function(el) {
          // Must be a leaf-ish element with 2-40 chars of text (team abbreviation or full name)
          var t = txt(el);
          return t.length >= 2 && t.length <= 40 && !el.querySelector("[class*=team]");
        });

        if (nameEls.length >= 2) {
          home = txt(nameEls[0]);
          away = txt(nameEls[nameEls.length - 1]);
          // Date/time
          var dateEl = matchContainer.querySelector("time, [class*=date], [class*=Date], [class*=time], [class*=Time]");
          if (dateEl) matchDate = txt(dateEl);
          // Status (FT, Live, etc.) — strip digits to avoid picking up score text
          var statusEl = matchContainer.querySelector("[class*=status], [class*=Status], [class*=result], [class*=Result]");
          if (statusEl) {
            // Clone and remove score spans so we only get the status text
            var clone = statusEl.cloneNode(true);
            Array.from(clone.querySelectorAll("[class*=score], [class*=Score]")).forEach(function(n) { n.remove(); });
            status = clone.textContent.trim().replace(/\s+/g, " ");
          }
          break;
        }
      }

      // Fallback: if no team class found, extract meaningful text nodes from matchContainer siblings
      if (!home && matchContainer) {
        // Get all text from siblings of scoreBox that aren't the scoreBox itself
        var allText = Array.from(matchContainer.children || [])
          .filter(function(ch) { return ch !== scoreBox && ch.querySelectorAll("[class*=match-row_score]").length === 0; })
          .map(function(ch) { return txt(ch); })
          .filter(function(t) { return t.length >= 2 && t.length <= 50; });
        if (allText.length >= 2) {
          home = allText[0];
          away = allText[allText.length - 1];
        }
      }

      if (home || homeScore) {
        results.push({
          home: home || "?",
          away: away || "?",
          homeScore: homeScore,
          awayScore: awayScore,
          date: matchDate,
          status: status,
        });
      }
    });

    // Deduplicate (same home+away)
    var seen = new Set();
    results = results.filter(function(m) {
      var key = m.home + "|" + m.away;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { matches: results, scoreSpanCount: scoreSpans.length, containerCount: containers.size };
  });

  console.log("  matchcentre: " + (matches.matches ? matches.matches.length : 0) + " matches, scoreSpans=" + matches.scoreSpanCount + ", containers=" + matches.containerCount);
  if (matches.matches && matches.matches.length > 0) {
    console.log("  Sample:", JSON.stringify(matches.matches.slice(0, 3), null, 2));
  } else {
    console.log("  debug:", matches.debug || "no matches extracted");
  }
  return matches;
}

// ── Push to Firestore ─────────────────────────────────────────────────────────
async function push(docId, payload) {
  await db.collection("live_data").doc(docId).set(
    Object.assign({}, payload, { updatedAt: new Date().toISOString(), source: "fifa_crawler" }),
    { merge: true }
  );
  console.log("  ✅ Pushed: live_data/" + docId);
}

// ── Main ──────────────────────────────────────────────────────────────────────
try {
  for (const task of tasks) {
    console.log("\n── " + task.toUpperCase() + " ──");

    if (task === "scorers") {
      const rows = await scrapePlayerStats("scorers");
      if (rows && rows.length) {
        const top10 = rows.filter(function(r) { return r.goals > 0; }).slice(0, 10);
        await push("fifa_scorers", { scorers: top10.map(function(r) { return { name: r.name, teamCode: r.team, count: r.goals }; }) });
        await push("cached_scorers_raw_fifa", { rows: rows });
      }

    } else if (task === "assists") {
      const rows = await scrapePlayerStats("assists");
      if (rows && rows.length) {
        // Sort by assists descending (works even if tab click failed — uses vals[1] for all 50 rows)
        const sorted = rows.slice().sort(function(a, b) { return b.assists - a.assists; });
        console.log("  Top 3 by assists:", sorted.slice(0, 3).map(function(r) { return r.name + ":" + r.assists; }));
        const top10 = sorted.filter(function(r) { return r.assists > 0; }).slice(0, 10);
        await push("fifa_assists", { assists: top10.map(function(r) { return { name: r.name, teamCode: r.team, count: r.assists }; }) });
        await push("cached_assists_raw_fifa", { rows: rows });
      }

    } else if (task === "fixtures") {
      const data = await scrapeFixtures();
      if (data) await push("cached_fixtures_fifa", { raw: data });

    } else if (task === "matchcentre") {
      const data = await scrapeMatchCentre();
      if (data && data.matches && data.matches.length > 0) {
        const today = new Date().toISOString().slice(0, 10); // "2026-06-28"
        // Tag each match with the date it was scraped
        const tagged = data.matches.map(function(m) { return Object.assign({}, m, { scrapedAt: today }); });
        // Merge with existing history (deduplicate by home+away key)
        const existingDoc = await db.collection("live_data").doc("fifa_match_results").get();
        const existingMatches = existingDoc.exists ? (existingDoc.data().matches || []) : [];
        const existingKeys = new Set(existingMatches.map(function(m) { return m.home + "|" + m.away; }));
        // Update scores/date for existing matches, add new ones
        const updated = existingMatches.map(function(m) {
          const key = m.home + "|" + m.away;
          const fresh = tagged.find(function(n) { return n.home + "|" + n.away === key; });
          return fresh ? Object.assign({}, m, fresh) : m;
        });
        const newMatches = tagged.filter(function(m) { return !existingKeys.has(m.home + "|" + m.away); });
        const allMatches = updated.concat(newMatches);
        console.log("  Saving " + allMatches.length + " matches total (" + newMatches.length + " new)");
        await push("fifa_match_results", { matches: allMatches });
      } else {
        console.log("  ⚠️  No matches extracted — skipping push");
        if (data) console.log("  Raw:", JSON.stringify(data).slice(0, 500));
      }
    }
  }

  console.log("\n🎉 Done!");
} finally {
  await browser.close();
}
