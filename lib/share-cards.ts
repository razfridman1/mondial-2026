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
import { AVATARS } from "./avatars";
import { formatIsraelDate, formatIsraelTime } from "./utils";
import { scorePrediction } from "./scoring";
import type { Match, LeaderRow } from "./types";

type CardKind = "match" | "prediction" | "leaderboard" | "leaderboard-table" | "match-predictions";

interface MatchCardArgs { match: Match; }
interface PredictionCardArgs { match: Match; home: number; away: number; joker?: boolean; }
interface LeaderboardCardArgs { rank: number; name: string; points: number; }
interface LeaderboardTableArgs { rows: LeaderRow[]; groupName?: string | null; limit?: number; }
export interface MatchPredictionRow {
  displayName: string;
  avatarId: string;
  homeScore: number | null;
  awayScore: number | null;
  predictedWinner?: string | null;
  joker?: boolean;
  auto?: boolean;
  hidden?: boolean;
  isSelf?: boolean;
}
interface MatchPredictionsCardArgs {
  match: Match;
  predictions: MatchPredictionRow[];
  groupName?: string | null;
  /* When the match has finished, pass the real result so each member's
   * points (🎯/✅) can be shown alongside their prediction — matching the
   * "🔮 מה החברים ניחשו" section in the match modal. */
  result?: { home: number; away: number; winner?: string } | null;
  isKnockout?: boolean;
}

export function buildSvg(kind: CardKind, args: any): { svg: string; width: number; height: number; filename: string } {
  switch (kind) {
    case "match":             return buildMatchInstaCard(args as MatchCardArgs);
    case "prediction":        return buildPredictionCard(args as PredictionCardArgs);
    case "leaderboard":       return buildLeaderboardCard(args as LeaderboardCardArgs);
    case "leaderboard-table": return buildLeaderboardTableCard(args as LeaderboardTableArgs);
    case "match-predictions": return buildMatchPredictionsCard(args as MatchPredictionsCardArgs);
  }
}

/* Escape text for safe embedding inside SVG <text> elements. */
function escapeXml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

/* ------- Leaderboard TABLE card — looks like the in-app "🏆 דירוג חברים"
 * leaderboard list (dark cards, gold/silver/bronze highlight for top 3,
 * avatar + name + points), so a shared screenshot looks like the real app. */
function buildLeaderboardTableCard({ rows, groupName, limit = 10 }: LeaderboardTableArgs) {
  const W = 1080;
  const top = rows.slice(0, limit);
  const ROW_H = 132;
  const HEADER_H = groupName ? 320 : 260;
  const FOOTER_H = 110;
  const H = HEADER_H + Math.max(top.length, 1) * ROW_H + FOOTER_H;

  const medal = (rank: number) => rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
  const rankColor = (rank: number) => rank === 1 ? "#ffd24a" : rank === 2 ? "#c0c0c0" : rank === 3 ? "#cd7f32" : "#2a3354";

  const rowsSvg = top.map((r, i) => {
    const rank = r.rank || i + 1;
    const y = HEADER_H + i * ROW_H;
    const accent = rankColor(rank);
    const isTop3 = rank <= 3;
    const avatar = AVATARS.find(a => a.id === r.avatarId);
    const flag = avatar?.flag || "👤";
    const m = medal(rank);
    return `
    <g transform="translate(0 ${y})">
      <rect x="60" y="12" width="${W - 120}" height="${ROW_H - 24}" rx="20"
            fill="#181f37" stroke="${accent}" stroke-width="${isTop3 ? 5 : 2}"
            ${rank === 1 ? `fill-opacity="1"` : ""}/>
      ${rank === 1 ? `<rect x="60" y="12" width="${W - 120}" height="${ROW_H - 24}" rx="20" fill="#ffd24a" fill-opacity="0.08"/>` : ""}
      <text x="${W - 110}" y="${ROW_H / 2 + 16}" text-anchor="middle" font-family="Heebo, Rubik, Arial" font-size="44" font-weight="900" fill="${isTop3 ? accent : "#ffd24a"}">${m || `#${rank}`}</text>
      <text x="${W - 195}" y="${ROW_H / 2 + 18}" text-anchor="middle" font-size="62">${flag}</text>
      <text x="${W - 270}" y="${ROW_H / 2 + 14}" text-anchor="end" font-family="Heebo, Rubik, Arial" font-size="38" font-weight="800" fill="#eef1ff">${escapeXml(r.displayName)}</text>
      <text x="170" y="${ROW_H / 2 + 14}" text-anchor="end" font-family="Heebo, Rubik, Arial" font-size="46" font-weight="900" fill="#ffd24a">${r.totalPoints}</text>
      <text x="180" y="${ROW_H / 2 + 14}" text-anchor="start" font-family="Heebo" font-size="22" fill="#9aa3c7">נק'</text>
    </g>`;
  }).join("");

  const now = new Date().toISOString();
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

  <g transform="translate(${W / 2} 100)" text-anchor="middle" font-family="Heebo, Rubik, Arial">
    <text font-size="58" font-weight="900" fill="url(#gold)">🏆 לוח התוצאות</text>
    ${groupName ? `<text y="58" font-size="36" font-weight="700" fill="#eef1ff">${escapeXml(groupName)}</text>` : ""}
    <text y="${groupName ? 108 : 56}" font-size="24" fill="#9aa3c7">מונדיאל 2026 · ${formatIsraelDate(now)} ${formatIsraelTime(now)}</text>
  </g>

  ${rowsSvg}

  ${rows.length > top.length ? `<text x="${W / 2}" y="${HEADER_H + top.length * ROW_H + 50}" text-anchor="middle" font-family="Heebo" font-size="24" fill="#9aa3c7">+ עוד ${rows.length - top.length} משתתפים</text>` : ""}

  <text x="${W / 2}" y="${H - 36}" text-anchor="middle" font-family="Heebo" font-size="24" fill="#9aa3c7">#מונדיאל2026 #מי_יצדק</text>
</svg>`,
    width: W, height: H,
    filename: `mondial-leaderboard-table.png`,
  };
}

/* ------- Match predictions card — styled like the in-app "🔮 מה החברים
 * ניחשו" grid (avatars + names + each member's score for one match), so a
 * shared image looks like the real app. Used for "share predictions" once
 * a match is live or finished. */
function buildMatchPredictionsCard({ match, predictions, groupName, result, isKnockout }: MatchPredictionsCardArgs) {
  const W = 1080;
  const home = TEAMS[match.home] || { name: match.home, flag: "?" } as any;
  const away = TEAMS[match.away] || { name: match.away, flag: "?" } as any;
  const stage = STAGES[match.stage]?.name || "";
  const list = predictions.slice(0, 20);
  /* Two-column grid layout, matching the in-app "🔮 מה החברים ניחשו" grid
   * (.fr-preds-grid): RTL order, so item 0 is the top-right cell, item 1 the
   * top-left cell, item 2 the second row's right cell, etc. */
  const COLS = 2;
  const GAP = 24;
  const CW = (W - 120 - GAP) / 2;
  const CH = 156;
  const ROW_GAP = 20;
  const rowsCount = Math.max(Math.ceil(list.length / COLS), 1);
  const HEADER_H = groupName ? 460 : 410;
  const FOOTER_H = 100;
  const H = HEADER_H + rowsCount * (CH + ROW_GAP) + FOOTER_H;

  const rowsSvg = list.map((p, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = col === 0 ? (W - 60 - CW) : 60;
    const y = HEADER_H + row * (CH + ROW_GAP);
    const avatar = AVATARS.find(a => a.id === p.avatarId);
    const flag = avatar?.flag || "👤";
    const scoreText = p.hidden
      ? "🔒"
      : (p.homeScore != null && p.awayScore != null ? `${p.homeScore} : ${p.awayScore}` : "—");
    const accent = p.isSelf ? "#ffd24a" : "#2a3354";
    /* For finished matches (result provided), show the points each member
     * earned for their prediction, mirroring the "🔮 מה החברים ניחשו"
     * section in the match modal (🎯 for an exact score, ✅/points otherwise). */
    const sc = (result && !p.hidden && p.homeScore != null && p.awayScore != null) ? scorePrediction({
      predictedHome: p.homeScore, predictedAway: p.awayScore,
      actualHome: result.home, actualAway: result.away,
      predictedWinner: p.predictedWinner ?? null,
      actualWinner: result.winner ?? null,
      isKnockout: !!isKnockout,
    }) : null;
    const tagX = 175;
    const pointsX = (p.auto && !p.hidden) ? 230 : 175;
    return `
    <g transform="translate(${x} ${y})">
      <rect x="0" y="0" width="${CW}" height="${CH}" rx="20"
            fill="#181f37" stroke="${accent}" stroke-width="${p.isSelf ? 4 : 2}"/>
      <text x="${CW - 58}" y="56" text-anchor="middle" font-size="52">${flag}</text>
      <text x="${CW - 100}" y="50" text-anchor="end" font-family="Heebo, Rubik, Arial" font-size="30" font-weight="800" fill="#eef1ff">${escapeXml(p.displayName)}</text>
      ${p.isSelf ? `<rect x="${CW - 162}" y="62" width="62" height="30" rx="8" fill="#2a3354"/><text x="${CW - 131}" y="83" text-anchor="middle" font-family="Heebo, Rubik, Arial" font-size="20" font-weight="700" fill="#ffd24a">אתה</text>` : ""}
      <text x="24" y="${CH - 30}" text-anchor="start" font-family="Heebo, Rubik, Arial" font-size="44" font-weight="900" fill="${p.hidden ? "#9aa3c7" : "#ffd24a"}">${scoreText}</text>
      ${p.auto && !p.hidden ? `<text x="${tagX}" y="${CH - 30}" font-size="32">🤖</text>` : ""}
      ${sc ? `<text x="${pointsX}" y="${CH - 30}" text-anchor="start" font-family="Heebo, Rubik, Arial" font-size="30" font-weight="800" fill="${sc.points > 0 ? "#7CFC9A" : "#9aa3c7"}">${sc.exact ? "🎯 " : ""}${sc.points} נק׳</text>` : ""}
    </g>`;
  }).join("");

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

  <g transform="translate(${W / 2} 110)" text-anchor="middle" font-family="Heebo, Rubik, Arial">
    <text font-size="46" font-weight="900" fill="url(#gold)">🔮 הניחושים של הקבוצה</text>
    ${groupName ? `<text y="56" font-size="32" font-weight="700" fill="#eef1ff">${escapeXml(groupName)}</text>` : ""}
    <text y="${groupName ? 110 : 60}" font-size="24" fill="#9aa3c7">${stage}${match.group ? ` · בית ${match.group}` : ""}</text>
  </g>

  <g transform="translate(0 ${groupName ? 270 : 230})" text-anchor="middle" font-family="Heebo, Rubik" fill="#fff">
    <text x="${W * 0.25}" y="0"  font-size="120">${home.flag}</text>
    <text x="${W * 0.25}" y="80" font-size="38" font-weight="800">${home.name}</text>

    <text x="${W * 0.5}"  y="-10" font-size="56" font-weight="900" fill="url(#gold)">VS</text>
    ${result ? `<text x="${W * 0.5}" y="50" font-size="34" font-weight="800" fill="#eef1ff">🏁 ${result.home} : ${result.away}</text>` : ""}

    <text x="${W * 0.75}" y="0"  font-size="120">${away.flag}</text>
    <text x="${W * 0.75}" y="80" font-size="38" font-weight="800">${away.name}</text>
  </g>

  ${rowsSvg}

  ${predictions.length > list.length ? `<text x="${W / 2}" y="${HEADER_H + rowsCount * (CH + ROW_GAP) + 50}" text-anchor="middle" font-family="Heebo" font-size="24" fill="#9aa3c7">+ עוד ${predictions.length - list.length} ניחושים</text>` : ""}

  <text x="${W / 2}" y="${H - 36}" text-anchor="middle" font-family="Heebo" font-size="24" fill="#9aa3c7">#מונדיאל2026 #מי_יצדק</text>
</svg>`,
    width: W, height: H,
    filename: `mondial-${match.id}-group-preds.png`,
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

/* Open a modal that shows the card + share-to-story button */
export function openShareCard(kind: CardKind, args: any) {
  const { svg, width, height } = buildSvg(kind, args);

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
        <button class="btn btn-primary" data-act="story">📸 שתף בסטורי באינסטגרם</button>
      </div>
      <p class="muted" style="font-size:11px;margin-top:10px; line-height:1.5;">
        📱 לחיצה תפתח את אפליקציית האינסטגרם (במובייל). אם אתה במחשב, פתח את האתר בטלפון כדי לשתף בסטורי.
      </p>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || (e.target as HTMLElement).classList.contains("modal-close")) overlay.remove();
  });

  overlay.querySelector("[data-act='story']")!.addEventListener("click", async () => {
    try {
      const blob = await svgToPngBlob(svg, width, height);
      if (!isMobile()) {
        alert("📱 שיתוף לסטורי באינסטגרם זמין רק במובייל. פתח את האתר בטלפון שלך ונסה שוב.");
        return;
      }
      const ok = await openInstagramStory(blob);
      if (!ok) {
        alert("לא הצלחנו לפתוח את אפליקציית האינסטגרם. ודא שהיא מותקנת במכשיר.");
      }
    } catch (e) {
      alert("שגיאה בשיתוף — נסה שוב.");
    }
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* Open a modal that shows the leaderboard as a card styled like the in-app
 * "🏆 דירוג חברים" table (dark cards, gold/silver/bronze rows, avatars,
 * points), and lets the user share it as an IMAGE (WhatsApp, etc. via the
 * native share sheet) or download it — instead of the old plain-text
 * message. */
export function openLeaderboardShareCard(rows: LeaderRow[], groupName?: string | null) {
  const { svg, width, height, filename } = buildSvg("leaderboard-table", { rows, groupName });

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" style="max-width: 480px;">
      <button class="modal-close" aria-label="סגור">✕</button>
      <header class="modal-header">
        <h2>🏆 שתף את לוח התוצאות</h2>
        <div class="muted">תמונה בעיצוב האתר — מוכנה לשיתוף</div>
      </header>
      <div class="share-card-preview" style="max-height: 60vh; overflow:auto;">${svg}</div>
      <div class="mc-actions" style="margin-top:14px; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-primary" data-act="share">📤 שתף</button>
        <button class="btn" data-act="download">⬇️ הורד תמונה</button>
      </div>
      <p class="muted" style="font-size:11px;margin-top:10px; line-height:1.5;">
        📱 לחיצה על "שתף" תפתח את תפריט השיתוף (וואטסאפ ועוד). אם זה לא עובד במכשיר שלך, לחץ "הורד תמונה" ושתף אותה ידנית.
      </p>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || (e.target as HTMLElement).classList.contains("modal-close")) overlay.remove();
  });

  overlay.querySelector("[data-act='share']")!.addEventListener("click", async () => {
    try {
      const blob = await svgToPngBlob(svg, width, height);
      const file = new File([blob], filename, { type: "image/png" });
      if ((navigator as any).canShare && (navigator as any).canShare({ files: [file] })) {
        await (navigator as any).share({ files: [file], title: "מונדיאל 2026 — לוח התוצאות" });
        return;
      }
      downloadBlob(blob, filename);
      alert("השיתוף הישיר לא נתמך בדפדפן הזה — התמונה הורדה, אפשר לצרף אותה ידנית בוואטסאפ.");
    } catch {
      alert("שגיאה בשיתוף — נסה שוב.");
    }
  });

  overlay.querySelector("[data-act='download']")!.addEventListener("click", async () => {
    try {
      const blob = await svgToPngBlob(svg, width, height);
      downloadBlob(blob, filename);
    } catch {
      alert("שגיאה ביצירת התמונה.");
    }
  });
}

/* Open a modal that shows the group's predictions for a single match as a
 * card styled like the in-app "🔮 מה החברים ניחשו" grid, and lets the user
 * share it as an IMAGE (WhatsApp etc. via the native share sheet) or
 * download it. Used by the "📤 שתף ניחושים" button once a match is live. */
export function openMatchPredictionsShareCard(
  match: Match,
  predictions: MatchPredictionRow[],
  groupName?: string | null,
  extra?: { result?: { home: number; away: number; winner?: string } | null; isKnockout?: boolean },
) {
  const { svg, width, height, filename } = buildSvg("match-predictions", {
    match, predictions, groupName,
    result: extra?.result ?? null,
    isKnockout: !!extra?.isKnockout,
  });

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" style="max-width: 480px;">
      <button class="modal-close" aria-label="סגור">✕</button>
      <header class="modal-header">
        <h2>🔮 שתף את הניחושים</h2>
        <div class="muted">תמונה בעיצוב האתר — מוכנה לשיתוף</div>
      </header>
      <div class="share-card-preview" style="max-height: 60vh; overflow:auto;">${svg}</div>
      <div class="mc-actions" style="margin-top:14px; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-primary" data-act="share">📤 שתף</button>
        <button class="btn" data-act="download">⬇️ הורד תמונה</button>
      </div>
      <p class="muted" style="font-size:11px;margin-top:10px; line-height:1.5;">
        📱 לחיצה על "שתף" תפתח את תפריט השיתוף (וואטסאפ ועוד). אם זה לא עובד במכשיר שלך, לחץ "הורד תמונה" ושתף אותה ידנית.
      </p>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || (e.target as HTMLElement).classList.contains("modal-close")) overlay.remove();
  });

  overlay.querySelector("[data-act='share']")!.addEventListener("click", async () => {
    try {
      const blob = await svgToPngBlob(svg, width, height);
      const file = new File([blob], filename, { type: "image/png" });
      if ((navigator as any).canShare && (navigator as any).canShare({ files: [file] })) {
        await (navigator as any).share({ files: [file], title: "מונדיאל 2026 — ניחושי הקבוצה" });
        return;
      }
      downloadBlob(blob, filename);
      alert("השיתוף הישיר לא נתמך בדפדפן הזה — התמונה הורדה, אפשר לצרף אותה ידנית בוואטסאפ.");
    } catch {
      alert("שגיאה בשיתוף — נסה שוב.");
    }
  });

  overlay.querySelector("[data-act='download']")!.addEventListener("click", async () => {
    try {
      const blob = await svgToPngBlob(svg, width, height);
      downloadBlob(blob, filename);
    } catch {
      alert("שגיאה ביצירת התמונה.");
    }
  });
}
