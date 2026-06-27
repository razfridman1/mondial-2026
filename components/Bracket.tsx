"use client";

import { useMemo } from "react";
import { MATCHES, TEAMS } from "@/lib/data";
import { resolveAllStages } from "@/lib/bracket";
import { useStore, type LiveScore } from "@/lib/store";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";
import type { MatchResult } from "@/lib/standings";

/* ================================================================
 * Layout constants
 * ================================================================ */
const CW = 138;   // card width (px)
const CH = 56;    // card height (px)
const SH = 72;    // slot height — vertical spacing per R32 row
const CG = 30;    // column gap (horizontal space between rounds)

/* Column left-edge x positions */
const r32L = 0;
const r16L = r32L + CW + CG;   // 168
const qfL  = r16L + CW + CG;   // 336
const sfL  = qfL  + CW + CG;   // 504
const finX = sfL  + CW + CG;   // 672
const sfR  = finX + CW + CG;   // 840
const qfR  = sfR  + CW + CG;   // 1008
const r16R = qfR  + CW + CG;   // 1176
const r32R = r16R + CW + CG;   // 1344

const TOTAL_W  = r32R + CW;    // 1482
const TOTAL_H  = SH * 8;       // 576
const LABEL_H  = 28;           // round label row height
const CONT_H   = LABEL_H + TOTAL_H + 8; // 612

/* Center-Y for each round (in SVG coordinate space) */
const R32Y = Array.from({ length: 8 }, (_, i) => i * SH + SH / 2);
// [36, 108, 180, 252, 324, 396, 468, 540]

function avg(a: number, b: number) { return (a + b) / 2; }

const R16Y = [
  avg(R32Y[0], R32Y[1]), // 72
  avg(R32Y[2], R32Y[3]), // 216
  avg(R32Y[4], R32Y[5]), // 360
  avg(R32Y[6], R32Y[7]), // 504
];
const QFY = [avg(R16Y[0], R16Y[1]), avg(R16Y[2], R16Y[3])]; // [144, 432]
const SFY = avg(QFY[0], QFY[1]);  // 288
const FINY = SFY;                  // 288

/* ================================================================
 * Match assignments — visual order top→bottom
 * ================================================================ */
const LEFT_R32  = ["M075","M078","M073","M076","M084","M083","M082","M081"];
const LEFT_R16  = ["M089","M090","M091","M092"];
const LEFT_QF   = ["M097","M098"];
const LEFT_SF   = "M101";

const RIGHT_R32 = ["M074","M077","M079","M080","M087","M086","M085","M088"];
const RIGHT_R16 = ["M093","M094","M095","M096"];
const RIGHT_QF  = ["M099","M100"];
const RIGHT_SF  = "M102";

const FINAL_ID = "M104";
const THIRD_ID = "M103";

/* ================================================================
 * Round labels
 * ================================================================ */
const ROUND_LABELS = [
  { label: "שלב 32",     cx: r32L + CW / 2 },
  { label: "שמינית גמר", cx: r16L + CW / 2 },
  { label: "רבע גמר",    cx: qfL  + CW / 2 },
  { label: "חצי גמר",    cx: sfL  + CW / 2 },
  { label: "גמר",        cx: finX + CW / 2 },
  { label: "חצי גמר",    cx: sfR  + CW / 2 },
  { label: "רבע גמר",    cx: qfR  + CW / 2 },
  { label: "שמינית גמר", cx: r16R + CW / 2 },
  { label: "שלב 32",     cx: r32R + CW / 2 },
];

/* ================================================================
 * SVG connector lines
 * ================================================================ */
function conn(x1: number, y1: number, mx: number, x2: number, y2: number) {
  return `M${x1} ${y1} L${mx} ${y1} L${mx} ${y2} L${x2} ${y2}`;
}

function buildConnectors(): string[] {
  const p: string[] = [];

  // Left R32 → R16
  const mx01 = r32L + CW + CG / 2; // 153
  for (let i = 0; i < 4; i++) {
    const r = R16Y[i];
    p.push(conn(r32L + CW, R32Y[i * 2],     mx01, r16L, r));
    p.push(conn(r32L + CW, R32Y[i * 2 + 1], mx01, r16L, r));
  }
  // Left R16 → QF
  const mx12 = r16L + CW + CG / 2; // 321
  for (let i = 0; i < 2; i++) {
    const q = QFY[i];
    p.push(conn(r16L + CW, R16Y[i * 2],     mx12, qfL, q));
    p.push(conn(r16L + CW, R16Y[i * 2 + 1], mx12, qfL, q));
  }
  // Left QF → SF
  const mx23 = qfL + CW + CG / 2; // 489
  p.push(conn(qfL + CW, QFY[0], mx23, sfL, SFY));
  p.push(conn(qfL + CW, QFY[1], mx23, sfL, SFY));
  // Left SF → Final (straight)
  p.push(`M${sfL + CW} ${SFY} L${finX} ${FINY}`);

  // Right R32 → R16
  const mx78 = r32R - CG / 2; // 1329
  for (let i = 0; i < 4; i++) {
    const r = R16Y[i];
    p.push(conn(r32R, R32Y[i * 2],     mx78, r16R + CW, r));
    p.push(conn(r32R, R32Y[i * 2 + 1], mx78, r16R + CW, r));
  }
  // Right R16 → QF
  const mx67 = r16R - CG / 2; // 1161
  for (let i = 0; i < 2; i++) {
    const q = QFY[i];
    p.push(conn(r16R, R16Y[i * 2],     mx67, qfR + CW, q));
    p.push(conn(r16R, R16Y[i * 2 + 1], mx67, qfR + CW, q));
  }
  // Right QF → SF
  const mx56 = qfR - CG / 2; // 993
  p.push(conn(qfR, QFY[0], mx56, sfR + CW, SFY));
  p.push(conn(qfR, QFY[1], mx56, sfR + CW, SFY));
  // Right SF → Final (straight)
  p.push(`M${sfR} ${SFY} L${finX + CW} ${FINY}`);

  return p;
}

const CONNECTORS = buildConnectors();

/* ================================================================
 * Helpers
 * ================================================================ */
const matchById = Object.fromEntries(MATCHES.map(m => [m.id, m]));

function getDateStr(id: string): string {
  const m = matchById[id];
  if (!m?.utc) return "";
  try {
    return `${formatIsraelDate(m.utc, { short: true })} · ${formatIsraelTime(m.utc)}`;
  } catch { return ""; }
}

/* ================================================================
 * Team row
 * ================================================================ */
function TeamRow({ code, score, isWinner, tbd }: {
  code: string; score: number | null; isWinner: boolean; tbd: boolean;
}) {
  const t = TEAMS[code] ?? null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4, padding: "1px 0",
      borderRadius: 3,
      background: isWinner ? "rgba(255,255,255,0.1)" : "transparent",
      fontWeight: isWinner ? 700 : 400,
      opacity: tbd ? 0.4 : 1,
      fontStyle: tbd ? "italic" as const : "normal" as const,
    }}>
      <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>
        {tbd ? "❓" : (t?.flag ?? "🏳")}
      </span>
      <span style={{
        flex: 1, fontSize: 11, overflow: "hidden",
        textOverflow: "ellipsis", whiteSpace: "nowrap" as const, lineHeight: 1.2,
      }}>
        {tbd ? "?" : (t?.name ?? code)}
      </span>
      {score !== null && (
        <span style={{
          fontSize: 12, fontWeight: 800,
          color: isWinner ? "#fbbf24" : "inherit",
          minWidth: 14, textAlign: "right" as const,
        }}>
          {score}
        </span>
      )}
    </div>
  );
}

/* ================================================================
 * Match card
 * ================================================================ */
function MatchCard({ id, resolved, results, liveScores, x, cy }: {
  id: string;
  resolved: Record<string, { home: string; away: string; winner: string; loser: string }>;
  results: Record<string, MatchResult>;
  liveScores: Record<string, LiveScore>;
  x: number;
  cy: number; // center-Y in SVG coordinate space
}) {
  const r    = resolved[id];
  const base = matchById[id];
  const homeCode = r?.home || base?.home || "";
  const awayCode = r?.away || base?.away || "";
  const homeTbd  = !TEAMS[homeCode];
  const awayTbd  = !TEAMS[awayCode];

  const res  = results[id];
  const live = liveScores[id];
  const homeScore = res?.home ?? (live != null ? live.home : null);
  const awayScore = res?.away ?? (live != null ? live.away : null);
  const hasScore  = homeScore !== null && awayScore !== null;
  const homeWins  = hasScore && homeScore > awayScore;
  const awayWins  = hasScore && awayScore > homeScore;
  const winner    = r?.winner || (res?.winner as string | undefined) || "";

  const isLive = !!live?.minuteLabel && !/HT|FT|AET|AP/i.test(live.minuteLabel ?? "");
  const isDone = !!res;
  const dateStr = getDateStr(id);

  return (
    <div style={{
      position: "absolute" as const,
      left: x, top: LABEL_H + cy - CH / 2,
      width: CW, height: CH,
      background: "rgba(255,255,255,0.06)",
      border: `1px solid ${isLive ? "#22c55e" : isDone ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.1)"}`,
      borderRadius: 6,
      padding: "4px 6px",
      boxSizing: "border-box" as const,
      display: "flex", flexDirection: "column" as const, gap: 1,
      boxShadow: isLive ? "0 0 8px rgba(34,197,94,0.4)" : "none",
    }}>
      {isLive && (
        <div style={{
          position: "absolute" as const, top: -9, left: "50%",
          transform: "translateX(-50%)",
          fontSize: 9, fontWeight: 700, color: "#22c55e",
          background: "var(--page-bg, #0f172a)",
          padding: "1px 5px", borderRadius: 4, whiteSpace: "nowrap" as const,
        }}>
          {live?.minuteLabel}
        </div>
      )}
      <TeamRow
        code={homeCode} score={homeScore}
        isWinner={winner ? winner === homeCode : homeWins}
        tbd={homeTbd}
      />
      <TeamRow
        code={awayCode} score={awayScore}
        isWinner={winner ? winner === awayCode : awayWins}
        tbd={awayTbd}
      />
      {dateStr && (
        <div style={{
          fontSize: 8.5, color: "var(--text-muted, #94a3b8)",
          textAlign: "center" as const, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" as const, marginTop: 1,
        }}>
          {dateStr}
        </div>
      )}
    </div>
  );
}

/* ================================================================
 * Main component
 * ================================================================ */
export default function Bracket() {
  const matchResults = useStore(s => s.matchResults);
  const liveScores   = useStore(s => s.liveScores);
  const resolved = useMemo(() => resolveAllStages(matchResults), [matchResults]);

  const mc = (id: string, x: number, cy: number) => (
    <MatchCard
      key={id} id={id}
      resolved={resolved} results={matchResults} liveScores={liveScores}
      x={x} cy={cy}
    />
  );

  return (
    <div style={{
      overflowX: "auto", overflowY: "hidden",
      padding: "8px 0 24px",
      // @ts-ignore
      WebkitOverflowScrolling: "touch",
    }}>
      <div style={{
        position: "relative" as const,
        width: TOTAL_W, minWidth: TOTAL_W, height: CONT_H,
        direction: "ltr",
      }}>

        {/* ---- Round labels ---- */}
        {ROUND_LABELS.map(({ label, cx }, i) => (
          <div key={i} style={{
            position: "absolute" as const, top: 4, left: cx - 54, width: 108,
            textAlign: "center" as const,
            fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const,
            letterSpacing: "0.06em", color: "var(--text-muted, #94a3b8)",
            whiteSpace: "nowrap" as const,
          }}>
            {label}
          </div>
        ))}

        {/* ---- SVG connector lines ---- */}
        <svg
          style={{ position: "absolute" as const, top: LABEL_H, left: 0, overflow: "visible", pointerEvents: "none" }}
          width={TOTAL_W} height={TOTAL_H}
        >
          {CONNECTORS.map((d, i) => (
            <path key={i} d={d} stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} fill="none" />
          ))}
        </svg>

        {/* ---- Left R32 ---- */}
        {LEFT_R32.map((id, i) => mc(id, r32L, R32Y[i]))}
        {/* ---- Left R16 ---- */}
        {LEFT_R16.map((id, i) => mc(id, r16L, R16Y[i]))}
        {/* ---- Left QF ---- */}
        {LEFT_QF.map((id, i) => mc(id, qfL, QFY[i]))}
        {/* ---- Left SF ---- */}
        {mc(LEFT_SF, sfL, SFY)}

        {/* ---- Final ---- */}
        {mc(FINAL_ID, finX, FINY)}
        <div style={{
          position: "absolute" as const,
          left: finX + CW / 2 - 14, top: LABEL_H + FINY + CH / 2 + 6,
          fontSize: 24, lineHeight: 1, textAlign: "center" as const,
        }}>🏆</div>
        <div style={{
          position: "absolute" as const,
          left: finX, top: LABEL_H + FINY + CH / 2 + 38,
          width: CW, textAlign: "center" as const,
          fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const,
          letterSpacing: "0.04em", color: "var(--text-muted, #94a3b8)",
        }}>
          מקום שלישי
        </div>
        {mc(THIRD_ID, finX, FINY + CH + 72)}

        {/* ---- Right SF ---- */}
        {mc(RIGHT_SF, sfR, SFY)}
        {/* ---- Right QF ---- */}
        {RIGHT_QF.map((id, i) => mc(id, qfR, QFY[i]))}
        {/* ---- Right R16 ---- */}
        {RIGHT_R16.map((id, i) => mc(id, r16R, R16Y[i]))}
        {/* ---- Right R32 ---- */}
        {RIGHT_R32.map((id, i) => mc(id, r32R, R32Y[i]))}

      </div>
    </div>
  );
}
