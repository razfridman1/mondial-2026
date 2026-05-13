/* =====================================================================
 * Share Cards — beautiful SVG cards for Instagram Story sharing.
 * - Instagram Story: 1080×1920 portrait (9:16)
 * - Prediction summary: per-user prediction card (also 9:16)
 *
 * Renders as SVG, opens a modal that:
 *   1. Displays the SVG preview
 *   2. Lets the user download as PNG (via canvas)
 *   3. Shares via Web Share API (native sheet → Instagram Stories)
 * ===================================================================*/
"use client";

import { TEAMS, CHANNELS, STAGES, VENUES } from "./data";
import { formatIsraelDate, formatIsraelTime } from "./utils";
import type { Match } from "./types";

type CardKind = "match" | "prediction" | "leaderboard";

interface MatchCardArgs { match: Match; }
interface PredictionCardArgs { match: Match; home: number; away: number; joker?: boolean; }
interface LeaderboardCardArgs { rank: number; name: string; points: number; }

export function buildSvg(kind: CardKind, args: any): { svg: string; width: number; height: number; filename: string } {
  switch (kind) {
    case "match":          return buildMatchInstaCard(args as MatchCardArgs);
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

/* Detect mobile so we can try the Instagram Stories deep link */
function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/* Try to open Instagram Stories directly with the image as background.
 * Works on iOS / Android when the Instagram app is installed.
 * Falls back to the native share sheet if the deep link doesn't fire. */
async function openInstagramStory(blob: Blob): Promise<boolean> {
  const file = new File([blob], "story.png", { type: "image/png" });

  // 1. Best: Web Share API with files — Instagram appears as a target
  if ((navigator as any).canShare && (navigator as any).canShare({ files: [file] })) {
    try {
      await (navigator as any).share({ files: [file], title: "מונדיאל 2026" });
      return true;
    } catch {}
  }

  // 2. iOS: instagram-stories:// scheme (requires base64 image)
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
      const base64 = dataUrl.split(",")[1];
      const url = `instagram-stories://share?source_application=mondial2026&background_image=${encodeURIComponent(base64)}`;
      window.location.href = url;
      return true;
    } catch {}
  }

  return false;
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
        <h2>📷 שתף בסטורי באינסטה</h2>
        <div class="muted">תמונה 1080×1080 מותאמת לסטורי</div>
      </header>
      <div class="share-card-preview">${svg}</div>
      <div class="mc-actions" style="margin-top:14px;">
        <button class="btn btn-primary" data-act="story">📸 שתף בסטורי</button>
        <button class="btn" data-act="download">⬇️ הורד תמונה</button>
      </div>
      <p class="muted" style="font-size:11px;margin-top:10px; line-height:1.5;">
        📱 <strong>מובייל:</strong> "שתף בסטורי" יפתח את אפליקציית האינסטגרם — בחר Stories.<br/>
        💻 <strong>מחשב:</strong> הורד את התמונה ושלח לעצמך בטלפון להעלאה כסטורי.
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

  overlay.querySelector("[data-act='story']")!.addEventListener("click", async () => {
    try {
      const blob = await svgToPngBlob(svg, width, height);
      if (isMobile()) {
        const ok = await openInstagramStory(blob);
        if (ok) return;
      }
      // Desktop or no share API: just download
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      if (!isMobile()) {
        alert("📥 התמונה ירדה. שלח אותה לטלפון שלך כדי להעלות כסטורי באינסטגרם.");
      }
    } catch (e) {}
  });
}
