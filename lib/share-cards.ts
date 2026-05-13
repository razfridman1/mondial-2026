/* =====================================================================
 * Share Cards — beautiful SVG cards designed per platform.
 * - Instagram: 1080×1080 square
 * - X (Twitter): 1200×675 landscape
 * - Prediction summary: per-user prediction card
 *
 * Renders as SVG, opens a modal that:
 *   1. Displays the SVG preview
 *   2. Lets the user download as PNG (via canvas)
 *   3. Shares via Web Share API (native sheet → WhatsApp/Instagram/X)
 * ===================================================================*/
"use client";

import { TEAMS, CHANNELS, STAGES, VENUES } from "./data";
import { formatIsraelDate, formatIsraelTime } from "./utils";
import type { Match } from "./types";

type CardKind = "match" | "match-twitter" | "prediction" | "leaderboard";

interface MatchCardArgs { match: Match; }
interface PredictionCardArgs { match: Match; home: number; away: number; joker?: boolean; }
interface LeaderboardCardArgs { rank: number; name: string; points: number; }

export function buildSvg(kind: CardKind, args: any): { svg: string; width: number; height: number; filename: string } {
  switch (kind) {
    case "match":          return buildMatchInstaCard(args as MatchCardArgs);
    case "match-twitter":  return buildMatchTwitterCard(args as MatchCardArgs);
    case "prediction":     return buildPredictionCard(args as PredictionCardArgs);
    case "leaderboard":    return buildLeaderboardCard(args as LeaderboardCardArgs);
  }
}

/* ------- 1080×1080 Instagram square ------- */
function buildMatchInstaCard({ match }: MatchCardArgs) {
  const W = 1080, H = 1080;
  const home = TEAMS[match.home] || { name: match.home, flag: "?" } as any;
  const away = TEAMS[match.away] || { name: match.away, flag: "?" } as any;
  const venue = VENUES[match.venue] || { name: "", city: "" } as any;
  const stage = STAGES[match.stage]?.name || "";
  const channels = (match.channels || []).map(c => CHANNELS[c]?.name).filter(Boolean).slice(0, 3).join(" · ");
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"  stop-color="#0b1020"/>
      <stop offset="60%" stop-color="#182343"/>
      <stop offset="100%" stop-color="#0b1020"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffd24a"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- subtle football pattern overlay -->
  <g opacity="0.08" fill="#fff">
    <circle cx="120" cy="180" r="50" fill="none" stroke="#fff" stroke-width="3"/>
    <circle cx="940" cy="220" r="40" fill="none" stroke="#fff" stroke-width="3"/>
    <circle cx="180" cy="900" r="60" fill="none" stroke="#fff" stroke-width="3"/>
    <circle cx="920" cy="860" r="45" fill="none" stroke="#fff" stroke-width="3"/>
  </g>

  <!-- Top brand -->
  <g transform="translate(${W/2} 130)">
    <text text-anchor="middle" font-family="Heebo, Rubik, Arial" font-size="40" font-weight="900" fill="url(#gold)">
      מונדיאל 2026 ⚽
    </text>
    <text text-anchor="middle" y="50" font-family="Heebo" font-size="22" fill="#9aa3c7">${stage}${match.group ? ` · בית ${match.group}` : ""}</text>
  </g>

  <!-- Teams VS -->
  <g transform="translate(0 480)" text-anchor="middle" font-family="Heebo, Rubik, Arial" fill="#fff">
    <text x="${W*0.25}" y="0"  font-size="200">${home.flag}</text>
    <text x="${W*0.25}" y="110" font-size="48" font-weight="800">${home.name}</text>

    <text x="${W*0.5}"  y="-20" font-size="72" font-weight="900" fill="url(#gold)">VS</text>

    <text x="${W*0.75}" y="0"  font-size="200">${away.flag}</text>
    <text x="${W*0.75}" y="110" font-size="48" font-weight="800">${away.name}</text>
  </g>

  <!-- Date / Time / Venue -->
  <g transform="translate(${W/2} 760)" text-anchor="middle" font-family="Heebo" fill="#fff">
    <text font-size="64" font-weight="900" fill="url(#gold)">${formatIsraelTime(match.utc)}</text>
    <text y="50" font-size="26" fill="#9aa3c7">${formatIsraelDate(match.utc)} · שעון ישראל</text>
    <text y="100" font-size="26" fill="#fff">🏟️ ${venue.name}${venue.city ? ` · ${venue.city}` : ""}</text>
  </g>

  <!-- Channels strip -->
  ${channels ? `<g transform="translate(${W/2} 950)" text-anchor="middle" font-family="Heebo" fill="#fff">
    <rect x="-360" y="-30" width="720" height="60" rx="30" fill="rgba(255,255,255,0.10)"/>
    <text y="8" font-size="22" font-weight="700">📺 ${channels}</text>
  </g>` : ""}

  <!-- Bottom hashtag -->
  <text x="${W/2}" y="1040" text-anchor="middle" font-family="Heebo" font-size="20" fill="#9aa3c7">#מונדיאל2026 #Mondial2026</text>
</svg>`,
    width: W, height: H,
    filename: `mondial-${match.id}-insta.png`,
  };
}

/* ------- 1200×675 Twitter/X landscape ------- */
function buildMatchTwitterCard({ match }: MatchCardArgs) {
  const W = 1200, H = 675;
  const home = TEAMS[match.home] || { name: match.home, flag: "?" } as any;
  const away = TEAMS[match.away] || { name: match.away, flag: "?" } as any;
  const stage = STAGES[match.stage]?.name || "";
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b1020"/>
      <stop offset="100%" stop-color="#182343"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffd24a"/><stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <g transform="translate(60 80)" font-family="Heebo, Rubik, Arial">
    <text font-size="32" font-weight="900" fill="url(#gold)">מונדיאל 2026 ⚽</text>
    <text y="40" font-size="20" fill="#9aa3c7">${stage}${match.group ? ` · בית ${match.group}` : ""}</text>
  </g>

  <g text-anchor="middle" font-family="Heebo, Rubik, Arial" fill="#fff">
    <text x="${W*0.25}" y="${H*0.55}" font-size="220">${home.flag}</text>
    <text x="${W*0.25}" y="${H*0.78}" font-size="44" font-weight="800">${home.name}</text>

    <text x="${W*0.5}" y="${H*0.45}" font-size="76" font-weight="900" fill="url(#gold)">VS</text>
    <text x="${W*0.5}" y="${H*0.62}" font-size="72" font-weight="900" fill="#fff">${formatIsraelTime(match.utc)}</text>
    <text x="${W*0.5}" y="${H*0.75}" font-size="22" fill="#9aa3c7">${formatIsraelDate(match.utc, { short: true })} · שעון ישראל</text>

    <text x="${W*0.75}" y="${H*0.55}" font-size="220">${away.flag}</text>
    <text x="${W*0.75}" y="${H*0.78}" font-size="44" font-weight="800">${away.name}</text>
  </g>

  <text x="${W/2}" y="${H - 30}" text-anchor="middle" font-family="Heebo" font-size="18" fill="#9aa3c7">
    #מונדיאל2026 · #FIFAWorldCup
  </text>
</svg>`,
    width: W, height: H,
    filename: `mondial-${match.id}-x.png`,
  };
}

/* ------- 1080×1080 Prediction summary ------- */
function buildPredictionCard({ match, home, away, joker }: PredictionCardArgs) {
  const W = 1080, H = 1080;
  const homeTeam = TEAMS[match.home] || { name: match.home, flag: "?" } as any;
  const awayTeam = TEAMS[match.away] || { name: match.away, flag: "?" } as any;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1020"/>
      <stop offset="60%" stop-color="#182343"/>
      <stop offset="100%" stop-color="#0b1020"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffd24a"/><stop offset="100%" stop-color="#dc2626"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <g transform="translate(${W/2} 130)" text-anchor="middle" font-family="Heebo, Rubik, Arial">
    <text font-size="42" font-weight="900" fill="url(#gold)">🔮 הניחוש שלי</text>
    <text y="46" font-size="22" fill="#9aa3c7">מונדיאל 2026</text>
  </g>

  <g transform="translate(0 ${H*0.40})" text-anchor="middle" font-family="Heebo, Rubik" fill="#fff">
    <text x="${W*0.22}" y="0"   font-size="180">${homeTeam.flag}</text>
    <text x="${W*0.22}" y="120" font-size="50" font-weight="800">${homeTeam.name}</text>

    <text x="${W*0.5}"  y="60"  font-size="240" font-weight="900" fill="url(#gold)">${home} : ${away}</text>

    <text x="${W*0.78}" y="0"   font-size="180">${awayTeam.flag}</text>
    <text x="${W*0.78}" y="120" font-size="50" font-weight="800">${awayTeam.name}</text>
  </g>

  <g transform="translate(${W/2} ${H - 100})" text-anchor="middle">
    <text font-family="Heebo" font-size="26" fill="#9aa3c7">${formatIsraelDate(match.utc)} · ${formatIsraelTime(match.utc)}</text>
    <text y="40" font-family="Heebo" font-size="22" fill="#9aa3c7">#מונדיאל2026 #מי_יצדק</text>
  </g>
</svg>`,
    width: W, height: H,
    filename: `mondial-${match.id}-pred.png`,
  };
}

/* ------- Leaderboard rank card ------- */
function buildLeaderboardCard({ rank, name, points }: LeaderboardCardArgs) {
  const W = 1080, H = 1080;
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "🏅";
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1020"/><stop offset="100%" stop-color="#182343"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffd24a"/><stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g transform="translate(${W/2} 200)" text-anchor="middle" font-family="Heebo, Rubik, Arial">
    <text font-size="320">${medal}</text>
    <text y="200" font-size="56" font-weight="900" fill="url(#gold)">מקום #${rank}</text>
    <text y="280" font-size="46" font-weight="800" fill="#fff">${name}</text>
    <text y="380" font-size="180" font-weight="900" fill="#fff">${points}</text>
    <text y="430" font-size="32" fill="#9aa3c7">נקודות</text>
    <text y="700" font-size="26" fill="#9aa3c7">#מונדיאל2026</text>
  </g>
</svg>`,
    width: W, height: H,
    filename: `mondial-leaderboard-${rank}.png`,
  };
}

/* =====================================================================
 * Render & share helpers (browser-only)
 * ===================================================================*/
async function svgToPngBlob(svg: string, w: number, h: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error("PNG render failed")), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG load failed")); };
    img.src = url;
  });
}

/* Open a modal that shows the card + download/share */
export function openShareCard(kind: CardKind, args: any) {
  const { svg, width, height, filename } = buildSvg(kind, args);

  /* Create modal */
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" style="max-width: 540px;">
      <button class="modal-close" aria-label="סגור">✕</button>
      <header class="modal-header">
        <h2>📷 שתף באינסטה</h2>
        <div class="muted">${kind === "match-twitter" ? "X / Twitter 1200×675" : "Instagram / WhatsApp 1080×1080"}</div>
      </header>
      <div class="share-card-preview">${svg}</div>
      <div class="mc-actions" style="margin-top:14px;">
        <button class="btn btn-primary" data-act="download">⬇️ הורד תמונה</button>
        <button class="btn wa-btn" data-act="share">📲 שתף</button>
        <button class="btn" data-act="copy-svg">📋 העתק SVG</button>
      </div>
      <p class="muted" style="font-size:11px;margin-top:8px;">
        טיפ: בנייד "שתף" יפתח את הסליל המקורי של המכשיר (WhatsApp / Instagram / X / Telegram).
      </p>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || (e.target as HTMLElement).classList.contains("modal-close")) overlay.remove();
  });

  overlay.querySelector("[data-act='download']")!.addEventListener("click", async () => {
    try {
      const blob = await svgToPngBlob(svg, width, height);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    } catch (e) {
      alert("שגיאה בהורדה");
    }
  });

  overlay.querySelector("[data-act='share']")!.addEventListener("click", async () => {
    try {
      const blob = await svgToPngBlob(svg, width, height);
      const file = new File([blob], filename, { type: "image/png" });
      if ((navigator as any).canShare && (navigator as any).canShare({ files: [file] })) {
        await (navigator as any).share({ files: [file], title: "מונדיאל 2026" });
      } else {
        // Desktop fallback: download
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      }
    } catch (e) {}
  });

  overlay.querySelector("[data-act='copy-svg']")!.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(svg);
      const btn = overlay.querySelector("[data-act='copy-svg']") as HTMLElement;
      const orig = btn.textContent;
      btn.textContent = "✓ הועתק";
      setTimeout(() => { btn.textContent = orig; }, 1500);
    } catch {}
  });
}
