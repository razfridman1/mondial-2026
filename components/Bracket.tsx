"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { MATCHES, TEAMS } from "@/lib/data";
import { resolveAllStages } from "@/lib/bracket";
import { useStore, type LiveScore } from "@/lib/store";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";
import type { MatchResult } from "@/lib/standings";

/* ================================================================
 * Layout constants (full design dimensions — scaled to fit screen)
 * ================================================================ */
const CW = 142;   // card width
const CH = 64;    // card height
const SH = 80;    // slot height (vertical spacing per R32 match)
const CG = 26;    // gap between round columns

const r32L = 0;
const r16L = r32L + CW + CG;   // 168
const qfL  = r16L + CW + CG;   // 336
const sfL  = qfL  + CW + CG;   // 504
const finX = sfL  + CW + CG;   // 672
const sfR  = finX + CW + CG;   // 840
const qfR  = sfR  + CW + CG;   // 1008
const r16R = qfR  + CW + CG;   // 1176
const r32R = r16R + CW + CG;   // 1344

const TOTAL_W = r32R + CW;   // 1486
const TOTAL_H = SH * 8;      // 640
const LABEL_H = 34;
const CONT_H  = LABEL_H + TOTAL_H + 80; // extra room for trophy + 3rd place

/* Center-Y positions (in SVG / absolute-coord space below label row) */
const R32Y = Array.from({ length: 8 }, (_, i) => i * SH + SH / 2);
function avg(a: number, b: number) { return (a + b) / 2; }
const R16Y = [avg(R32Y[0],R32Y[1]), avg(R32Y[2],R32Y[3]), avg(R32Y[4],R32Y[5]), avg(R32Y[6],R32Y[7])];
const QFY  = [avg(R16Y[0],R16Y[1]), avg(R16Y[2],R16Y[3])];
const SFY  = avg(QFY[0], QFY[1]);
const FINY = SFY;

/* ================================================================
 * Match assignments (visual order top → bottom)
 * ================================================================ */
const LEFT_R32  = ["M075","M078","M073","M076","M084","M083","M082","M081"];
const LEFT_R16  = ["M089","M090","M091","M092"];
const LEFT_QF   = ["M097","M098"];
const LEFT_SF   = "M101";
const RIGHT_R32 = ["M074","M077","M079","M080","M087","M086","M085","M088"];
const RIGHT_R16 = ["M093","M094","M095","M096"];
const RIGHT_QF  = ["M099","M100"];
const RIGHT_SF  = "M102";
const FINAL_ID  = "M104";
const THIRD_ID  = "M103";

/* ================================================================
 * Round labels
 * ================================================================ */
const ROUND_LABELS = [
  { label: "שלב 32",     cx: r32L + CW/2 },
  { label: "שמינית גמר", cx: r16L + CW/2 },
  { label: "רבע גמר",    cx: qfL  + CW/2 },
  { label: "חצי גמר",    cx: sfL  + CW/2 },
  { label: "גמר",        cx: finX + CW/2 },
  { label: "חצי גמר",    cx: sfR  + CW/2 },
  { label: "רבע גמר",    cx: qfR  + CW/2 },
  { label: "שמינית גמר", cx: r16R + CW/2 },
  { label: "שלב 32",     cx: r32R + CW/2 },
];

/* ================================================================
 * SVG connector lines
 * ================================================================ */
function conn(x1: number, y1: number, mx: number, x2: number, y2: number) {
  return `M${x1} ${y1} L${mx} ${y1} L${mx} ${y2} L${x2} ${y2}`;
}
function buildConnectors(): string[] {
  const p: string[] = [];
  const mx01 = r32L + CW + CG/2;
  for (let i=0;i<4;i++){const r=R16Y[i];p.push(conn(r32L+CW,R32Y[i*2],mx01,r16L,r));p.push(conn(r32L+CW,R32Y[i*2+1],mx01,r16L,r));}
  const mx12 = r16L + CW + CG/2;
  for (let i=0;i<2;i++){const q=QFY[i];p.push(conn(r16L+CW,R16Y[i*2],mx12,qfL,q));p.push(conn(r16L+CW,R16Y[i*2+1],mx12,qfL,q));}
  const mx23 = qfL + CW + CG/2;
  p.push(conn(qfL+CW,QFY[0],mx23,sfL,SFY));p.push(conn(qfL+CW,QFY[1],mx23,sfL,SFY));
  p.push(`M${sfL+CW} ${SFY} L${finX} ${FINY}`);
  const mx78 = r32R - CG/2;
  for (let i=0;i<4;i++){const r=R16Y[i];p.push(conn(r32R,R32Y[i*2],mx78,r16R+CW,r));p.push(conn(r32R,R32Y[i*2+1],mx78,r16R+CW,r));}
  const mx67 = r16R - CG/2;
  for (let i=0;i<2;i++){const q=QFY[i];p.push(conn(r16R,R16Y[i*2],mx67,qfR+CW,q));p.push(conn(r16R,R16Y[i*2+1],mx67,qfR+CW,q));}
  const mx56 = qfR - CG/2;
  p.push(conn(qfR,QFY[0],mx56,sfR+CW,SFY));p.push(conn(qfR,QFY[1],mx56,sfR+CW,SFY));
  p.push(`M${sfR} ${SFY} L${finX+CW} ${FINY}`);
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
  try { return `${formatIsraelDate(m.utc, { short: true })} · ${formatIsraelTime(m.utc)}`; }
  catch { return ""; }
}

/* ================================================================
 * Team row
 * ================================================================ */
function TeamRow({ code, score, isWinner, tbd }: {
  code: string; score: number|null; isWinner: boolean; tbd: boolean;
}) {
  const t = TEAMS[code] ?? null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5,
      padding: "2px 3px", borderRadius: 4,
      background: isWinner ? "rgba(255,255,255,0.12)" : "transparent",
      fontWeight: isWinner ? 700 : 400,
      opacity: tbd ? 0.38 : 1,
      fontStyle: tbd ? "italic" as const : "normal" as const,
    }}>
      <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>
        {tbd ? "❓" : (t?.flag ?? "🏳")}
      </span>
      <span style={{
        flex: 1, fontSize: 12, fontWeight: isWinner ? 700 : 500,
        overflow: "hidden", textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const, lineHeight: 1.2,
        color: isWinner ? "#ffffff" : "rgba(255,255,255,0.85)",
      }}>
        {tbd ? "?" : (t?.name ?? code)}
      </span>
      {score !== null && (
        <span style={{
          fontSize: 14, fontWeight: 800, minWidth: 16, textAlign: "right" as const,
          color: isWinner ? "#fbbf24" : "rgba(255,255,255,0.9)",
        }}>{score}</span>
      )}
    </div>
  );
}

/* ================================================================
 * Match card (absolutely positioned)
 * ================================================================ */
function MatchCard({ id, resolved, results, liveScores, x, cy, highlight }: {
  id: string;
  resolved: Record<string,{home:string;away:string;winner:string;loser:string}>;
  results: Record<string,MatchResult>;
  liveScores: Record<string,LiveScore>;
  x: number; cy: number;
  highlight?: boolean;
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
  const winner    = r?.winner || (res?.winner as string|undefined) || "";
  const isLive = !!live?.minuteLabel && !/HT|FT|AET|AP/i.test(live.minuteLabel ?? "");
  const isDone = !!res;
  const dateStr = getDateStr(id);

  const cardH = highlight ? CH + 4 : CH;
  const cardW = highlight ? CW + 4 : CW;

  return (
    <div style={{
      position: "absolute" as const,
      left: highlight ? x - 2 : x,
      top: LABEL_H + cy - cardH/2,
      width: cardW, height: cardH,
      background: highlight
        ? "rgba(255,200,50,0.10)"
        : isDone ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.05)",
      border: `${highlight ? 1.5 : 1}px solid ${
        isLive ? "#22c55e"
        : highlight ? "rgba(255,200,50,0.4)"
        : isDone ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.12)"
      }`,
      borderRadius: 8,
      padding: "4px 6px",
      boxSizing: "border-box" as const,
      display: "flex", flexDirection: "column" as const, gap: 2,
      boxShadow: isLive
        ? "0 0 10px rgba(34,197,94,0.45)"
        : highlight ? "0 0 16px rgba(255,200,50,0.2)" : "0 2px 8px rgba(0,0,0,0.3)",
    }}>
      {isLive && (
        <div style={{
          position: "absolute" as const, top: -10, left: "50%",
          transform: "translateX(-50%)",
          fontSize: 9, fontWeight: 800, color: "#22c55e",
          background: "#0a1628", padding: "1px 6px", borderRadius: 4,
          whiteSpace: "nowrap" as const, border: "1px solid rgba(34,197,94,0.3)",
        }}>
          🔴 {live?.minuteLabel}
        </div>
      )}
      <TeamRow code={homeCode} score={homeScore}
        isWinner={winner ? winner===homeCode : homeWins} tbd={homeTbd} />
      <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 -2px" }} />
      <TeamRow code={awayCode} score={awayScore}
        isWinner={winner ? winner===awayCode : awayWins} tbd={awayTbd} />
      {dateStr && (
        <div style={{
          fontSize: 8.5, color: "rgba(255,255,255,0.4)",
          textAlign: "center" as const, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
          marginTop: 1,
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

  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => {
      if (!outerRef.current) return;
      const w = outerRef.current.clientWidth - 16; // subtract padding
      setScale(Math.min(1, w / TOTAL_W));
    };
    update();
    let obs: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && outerRef.current) {
      obs = new ResizeObserver(update);
      obs.observe(outerRef.current);
    }
    return () => obs?.disconnect();
  }, []);

  const mc = (id: string, x: number, cy: number, highlight = false) => (
    <MatchCard key={id} id={id} resolved={resolved} results={matchResults}
      liveScores={liveScores} x={x} cy={cy} highlight={highlight} />
  );

  const scaledH = Math.round(CONT_H * scale) + 4;

  return (
    <div ref={outerRef} style={{
      width: "100%", padding: "8px",
      boxSizing: "border-box" as const,
    }}>
      <div style={{
        position: "relative",
        width: "100%",
        height: scaledH,
        overflow: "hidden",
        borderRadius: 14,
        background: "linear-gradient(160deg, #050f1e 0%, #091525 40%, #060e1c 100%)",
      }}>

        {/* ---- Background: football players collage (SVG) ---- */}
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          viewBox={`0 0 ${TOTAL_W} ${CONT_H}`}
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          {/* Pitch center elements */}
          <circle cx={TOTAL_W/2} cy={CONT_H/2-20} r="130" stroke="white" strokeWidth="2" fill="none" opacity="0.04"/>
          <line x1={TOTAL_W/2} y1="0" x2={TOTAL_W/2} y2={CONT_H} stroke="white" strokeWidth="2" opacity="0.03"/>
          {/* Left penalty area */}
          <rect x="0" y={CONT_H*0.3} width="110" height={CONT_H*0.4} stroke="white" strokeWidth="1.5" fill="none" opacity="0.04"/>
          {/* Right penalty area */}
          <rect x={TOTAL_W-110} y={CONT_H*0.3} width="110" height={CONT_H*0.4} stroke="white" strokeWidth="1.5" fill="none" opacity="0.04"/>
          {/* Football outlines */}
          <circle cx="160" cy="160" r="22" stroke="white" strokeWidth="2" fill="none" opacity="0.06"/>
          <circle cx={TOTAL_W-160} cy={CONT_H-150} r="18" stroke="white" strokeWidth="2" fill="none" opacity="0.05"/>
          <circle cx={TOTAL_W/2} cy={CONT_H-60} r="15" stroke="white" strokeWidth="2" fill="none" opacity="0.05"/>

          {/* Player 1 – top-left, kicking right */}
          <g stroke="white" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.07" transform="translate(70, 90) scale(1.4)">
            <circle cx="0" cy="0" r="11" fill="white" stroke="none" opacity="0.07"/>
            <line x1="0" y1="11" x2="0" y2="46"/>
            <line x1="0" y1="25" x2="-18" y2="40"/>
            <line x1="0" y1="25" x2="20" y2="36"/>
            <line x1="0" y1="46" x2="-14" y2="74"/>
            <line x1="0" y1="46" x2="16" y2="66"/>
            <line x1="16" y1="66" x2="34" y2="58"/>
          </g>

          {/* Player 2 – bottom-right, running */}
          <g stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.06" transform="translate(1330, 460) scale(1.3)">
            <circle cx="0" cy="0" r="10" fill="white" stroke="none" opacity="0.06"/>
            <line x1="0" y1="10" x2="-4" y2="42"/>
            <line x1="-2" y1="24" x2="-22" y2="34"/>
            <line x1="-2" y1="24" x2="16" y2="32"/>
            <line x1="-4" y1="42" x2="-18" y2="68"/>
            <line x1="-4" y1="42" x2="10" y2="64"/>
          </g>

          {/* Player 3 – mid-left, jumping (header) */}
          <g stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.055" transform="translate(200, 390) scale(1.2)">
            <circle cx="0" cy="0" r="10" fill="white" stroke="none" opacity="0.055"/>
            <line x1="0" y1="10" x2="5" y2="44"/>
            <line x1="2" y1="24" x2="-18" y2="20"/>
            <line x1="2" y1="24" x2="20" y2="18"/>
            <line x1="5" y1="44" x2="-10" y2="68"/>
            <line x1="5" y1="44" x2="20" y2="62"/>
          </g>

          {/* Player 4 – mid-right, celebrating */}
          <g stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.055" transform="translate(1240, 130) scale(1.2)">
            <circle cx="0" cy="0" r="10" fill="white" stroke="none" opacity="0.055"/>
            <line x1="0" y1="10" x2="0" y2="42"/>
            <line x1="0" y1="22" x2="-22" y2="10"/>
            <line x1="0" y1="22" x2="22" y2="10"/>
            <line x1="0" y1="42" x2="-12" y2="66"/>
            <line x1="0" y1="42" x2="14" y2="64"/>
          </g>

          {/* Subtle radial glow at center */}
          <radialGradient id="cg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.04"/>
            <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
          </radialGradient>
          <rect x="0" y="0" width={TOTAL_W} height={CONT_H} fill="url(#cg)"/>
        </svg>

        {/* ---- Bracket canvas (scaled to fit) ---- */}
        <div style={{
          position: "absolute", left: 0, top: 0,
          width: TOTAL_W, height: CONT_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}>

          {/* Round labels */}
          {ROUND_LABELS.map(({ label, cx }, i) => (
            <div key={i} style={{
              position: "absolute" as const, top: 6, left: cx - 60, width: 120,
              textAlign: "center" as const,
              fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const,
              letterSpacing: "0.07em", color: "rgba(255,255,255,0.45)",
              whiteSpace: "nowrap" as const,
            }}>
              {label}
            </div>
          ))}

          {/* Divider line under labels */}
          <div style={{
            position: "absolute", top: LABEL_H - 4, left: 0, right: 0,
            height: 1, background: "rgba(255,255,255,0.07)",
          }} />

          {/* SVG connector lines */}
          <svg style={{ position:"absolute", top:LABEL_H, left:0, overflow:"visible", pointerEvents:"none" }}
            width={TOTAL_W} height={TOTAL_H}>
            {CONNECTORS.map((d, i) => (
              <path key={i} d={d} stroke="rgba(255,255,255,0.22)" strokeWidth={1.5} fill="none"/>
            ))}
          </svg>

          {/* Match cards */}
          {LEFT_R32.map( (id,i) => mc(id, r32L, R32Y[i]))}
          {LEFT_R16.map( (id,i) => mc(id, r16L, R16Y[i]))}
          {LEFT_QF.map(  (id,i) => mc(id, qfL,  QFY[i]))}
          {mc(LEFT_SF,  sfL,  SFY)}
          {mc(FINAL_ID, finX, FINY, true)}
          {RIGHT_SF  &&  mc(RIGHT_SF,  sfR,  SFY)}
          {RIGHT_QF.map( (id,i) => mc(id, qfR,  QFY[i]))}
          {RIGHT_R16.map((id,i) => mc(id, r16R, R16Y[i]))}
          {RIGHT_R32.map((id,i) => mc(id, r32R, R32Y[i]))}

          {/* Trophy */}
          <div style={{
            position: "absolute" as const,
            left: finX + CW/2 - 16, top: LABEL_H + FINY + CH/2 + 8,
            fontSize: 28, lineHeight: 1, textAlign: "center" as const,
            filter: "drop-shadow(0 0 8px rgba(251,191,36,0.6))",
          }}>🏆</div>

          {/* 3rd place label */}
          <div style={{
            position: "absolute" as const,
            left: finX, top: LABEL_H + FINY + CH/2 + 48,
            width: CW, textAlign: "center" as const,
            fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const,
            letterSpacing: "0.05em", color: "rgba(255,255,255,0.35)",
          }}>מקום שלישי</div>

          {/* 3rd place match */}
          {mc(THIRD_ID, finX, FINY + CH + 78)}

        </div>
      </div>
    </div>
  );
}
