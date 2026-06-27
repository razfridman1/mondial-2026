"use client";
/* ================================================================
 * Bracket.tsx — Visual knockout bracket tree.
 *
 * Layout: two-sided bracket (left / right) that meets at the Final.
 * Data:   MATCHES from data.ts + resolveAllStages + store results.
 * ================================================================ */

import { useMemo } from "react";
import { MATCHES, TEAMS } from "@/lib/data";
import { resolveAllStages } from "@/lib/bracket";
import { useStore, type LiveScore } from "@/lib/store";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";
import type { MatchResult } from "@/lib/standings";

/* ---- Match ID constants ---------------------------------------- */
// R32 (sorted by UTC)
const R32 = ["M073","M074","M075","M076","M077","M078","M079","M080",
              "M081","M082","M083","M084","M085","M086","M087","M088"];
// R16
const R16 = ["M089","M090","M091","M092","M093","M094","M095","M096"];
// QF
const QF  = ["M097","M098","M099","M100"];
// SF
const SF  = ["M101","M102"];

const FINAL_ID = "M104";
const THIRD_ID = "M103";

/* ---- Bracket structure: which matches connect to which --------- */
//
// LEFT SIDE (R32→R16→QF→SF, reading top to bottom):
//   Pair 1: M073+M074 → R16 M089
//   Pair 2: M075+M076 → R16 M090  } → QF M097
//   Pair 3: M077+M078 → R16 M091
//   Pair 4: M079+M080 → R16 M092  } → QF M098
//   QF M097 + QF M098 → SF M101
//
// RIGHT SIDE (mirror, R32→R16→QF→SF):
//   Pair 5: M081+M082 → R16 M093
//   Pair 6: M083+M084 → R16 M094  } → QF M099
//   Pair 7: M085+M086 → R16 M095
//   Pair 8: M087+M088 → R16 M096  } → QF M100
//   QF M099 + QF M100 → SF M102
//
// FINAL: M104 (M101 winner vs M102 winner)
// THIRD: M103

/* ---- Build a matchById lookup from MATCHES ---- */
const matchById = Object.fromEntries(MATCHES.map(m => [m.id, m]));

/* ---- Helpers --------------------------------------------------- */

function teamInfo(code: string) {
  return TEAMS[code] ?? null;
}

function matchDate(id: string): { date: string; time: string } {
  const m = matchById[id];
  if (!m?.utc) return { date: "", time: "" };
  try {
    return {
      date: formatIsraelDate(m.utc, { short: true }),
      time: formatIsraelTime(m.utc),
    };
  } catch {
    return { date: "", time: "" };
  }
}

/* ---- Team row inside a match card ----------------------------- */
function TeamRow({
  code,
  score,
  isWinner,
  tbd,
}: {
  code: string;
  score: number | null;
  isWinner: boolean;
  tbd: boolean;
}) {
  const t = teamInfo(code);
  return (
    <div className={`bkt-team${isWinner ? " bkt-team-winner" : ""}${tbd ? " bkt-team-tbd" : ""}`}>
      <span className="bkt-flag">{tbd ? "❓" : (t?.flag ?? "🏳")}</span>
      <span className="bkt-name">{tbd ? "..." : (t?.name ?? code)}</span>
      {score !== null && <span className="bkt-score">{score}</span>}
    </div>
  );
}

/* ---- Match card ----------------------------------------------- */
function MatchCard({
  id,
  resolved,
  results,
  liveScores,
  compact = false,
}: {
  id: string;
  resolved: Record<string, { home: string; away: string; winner: string; loser: string }>;
  results: Record<string, MatchResult>;
  liveScores: Record<string, LiveScore>;
  compact?: boolean;
}) {
  const r = resolved[id];
  const base = matchById[id];
  const homeCode = r?.home || base?.home || "";
  const awayCode = r?.away || base?.away || "";
  const homeTbd = !TEAMS[homeCode];
  const awayTbd = !TEAMS[awayCode];

  const res = results[id];
  const live = liveScores[id];
  const homeScore = res?.home ?? (live != null ? live.home : null);
  const awayScore = res?.away ?? (live != null ? live.away : null);
  const hasScore = homeScore !== null && awayScore !== null;

  const homeWins = hasScore && homeScore > awayScore;
  const awayWins = hasScore && awayScore > homeScore;

  // Explicit winner from KO result
  const winner = r?.winner || (res?.winner as string | undefined) || "";

  const dt = matchDate(id);

  const isLiveNow = !!live?.minuteLabel && !/HT|FT|AET|AP/i.test(live.minuteLabel ?? "");
  const isDone = !!res;

  return (
    <div className={`bkt-card${isDone ? " bkt-done" : ""}${isLiveNow ? " bkt-live" : ""}${compact ? " bkt-compact" : ""}`}>
      {isLiveNow && (
        <div className="bkt-live-badge">
          <span className="mt-live-dot" /> {live?.minuteLabel ?? ""}
        </div>
      )}
      <TeamRow
        code={homeCode}
        score={homeScore}
        isWinner={winner ? winner === homeCode : homeWins}
        tbd={homeTbd}
      />
      <TeamRow
        code={awayCode}
        score={awayScore}
        isWinner={winner ? winner === awayCode : awayWins}
        tbd={awayTbd}
      />
      {dt.date && (
        <div className="bkt-meta">{dt.date}{dt.time ? " · " + dt.time : ""}</div>
      )}
    </div>
  );
}

/* ---- Pair: two R32 matches + connector line ------------------- */
function Pair({
  ids,
  side,
  resolved,
  results,
  liveScores,
}: {
  ids: [string, string];
  side: "left" | "right";
  resolved: Record<string, { home: string; away: string; winner: string; loser: string }>;
  results: Record<string, MatchResult>;
  liveScores: Record<string, LiveScore>;
}) {
  return (
    <div className={`bkt-pair bkt-pair-${side}`}>
      <MatchCard id={ids[0]} resolved={resolved} results={results} liveScores={liveScores} />
      <MatchCard id={ids[1]} resolved={resolved} results={results} liveScores={liveScores} />
    </div>
  );
}

/* ---- Round column --------------------------------------------- */
function RoundCol({
  ids,
  label,
  side,
  resolved,
  results,
  liveScores,
}: {
  ids: string[];
  label?: string;
  side: "left" | "right" | "center";
  resolved: Record<string, { home: string; away: string; winner: string; loser: string }>;
  results: Record<string, MatchResult>;
  liveScores: Record<string, LiveScore>;
}) {
  return (
    <div className={`bkt-col bkt-col-${side}`}>
      {label && <div className="bkt-col-label">{label}</div>}
      <div className="bkt-col-matches">
        {ids.map(id => (
          <div key={id} className={`bkt-slot bkt-slot-${side}`}>
            <MatchCard id={id} resolved={resolved} results={results} liveScores={liveScores} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Half bracket (left or right) ----------------------------- */
function HalfBracket({
  side,
  r32Pairs,
  r16Ids,
  qfIds,
  sfId,
  resolved,
  results,
  liveScores,
}: {
  side: "left" | "right";
  r32Pairs: [[string, string], [string, string], [string, string], [string, string]];
  r16Ids: [string, string, string, string];
  qfIds: [string, string];
  sfId: string;
  resolved: Record<string, { home: string; away: string; winner: string; loser: string }>;
  results: Record<string, MatchResult>;
  liveScores: Record<string, LiveScore>;
}) {
  const MC = (id: string) => (
    <MatchCard id={id} resolved={resolved} results={results} liveScores={liveScores} />
  );

  // For RIGHT side we want to reverse the visual order (reads right→left)
  const flip = side === "right";

  const r32Col = (
    <div className={`bkt-col bkt-col-r32-${side}`}>
      <div className="bkt-col-label">שלב 32</div>
      <div className="bkt-col-matches">
        {r32Pairs.map((pair, pi) => (
          <div key={pi} className={`bkt-pair bkt-pair-${side}`}>
            {MC(pair[0])}
            {MC(pair[1])}
          </div>
        ))}
      </div>
    </div>
  );

  const r16Col = (
    <div className={`bkt-col bkt-col-r16-${side}`}>
      <div className="bkt-col-label">שמינית גמר</div>
      <div className="bkt-col-matches">
        {[[r16Ids[0], r16Ids[1]], [r16Ids[2], r16Ids[3]]].map((grp, gi) => (
          <div key={gi} className={`bkt-r16-group bkt-r16-group-${side}`}>
            {MC(grp[0])}
            {MC(grp[1])}
          </div>
        ))}
      </div>
    </div>
  );

  const qfCol = (
    <div className={`bkt-col bkt-col-qf-${side}`}>
      <div className="bkt-col-label">רבע גמר</div>
      <div className="bkt-col-matches">
        {qfIds.map(id => (
          <div key={id} className={`bkt-qf-slot bkt-qf-slot-${side}`}>
            {MC(id)}
          </div>
        ))}
      </div>
    </div>
  );

  const sfCol = (
    <div className={`bkt-col bkt-col-sf-${side}`}>
      <div className="bkt-col-label">חצי גמר</div>
      <div className="bkt-col-matches">
        <div className={`bkt-sf-slot bkt-sf-slot-${side}`}>
          {MC(sfId)}
        </div>
      </div>
    </div>
  );

  const cols = flip
    ? [sfCol, qfCol, r16Col, r32Col]
    : [r32Col, r16Col, qfCol, sfCol];

  return (
    <div className={`bkt-half bkt-half-${side}`}>
      {cols}
    </div>
  );
}

/* ---- Main component ------------------------------------------- */
export default function Bracket() {
  const matchResults = useStore(s => s.matchResults);
  const liveScores   = useStore(s => s.liveScores);

  const resolved = useMemo(
    () => resolveAllStages(matchResults),
    [matchResults]
  );

  const props = { resolved, results: matchResults, liveScores };

  const MC = (id: string) => (
    <MatchCard id={id} resolved={resolved} results={matchResults} liveScores={liveScores} />
  );

  return (
    <div className="bkt-root" dir="rtl">
      {/* ---- Desktop bracket (horizontal tree) ---- */}
      <div className="bkt-tree">
        {/* Left half */}
        <HalfBracket
          side="left"
          r32Pairs={[
            /* LEFT-TOP (feeds R16 M089): GER/PAR + FRA/SWE */
            ["M075","M078"],
            /* LEFT-TOP (feeds R16 M090): RSA/CAN + NED/MAR */
            ["M073","M076"],
            /* LEFT-BOTTOM (feeds R16 M091): K2/L2 TBD + H1/J2 TBD */
            ["M084","M083"],
            /* LEFT-BOTTOM (feeds R16 M092): USA/BIH + BEL/TBD */
            ["M082","M081"],
          ]}
          r16Ids={["M089","M090","M091","M092"]}
          qfIds={["M097","M098"]}
          sfId="M101"
          {...props}
        />

        {/* Center: Final + 3rd place */}
        <div className="bkt-center">
          <div className="bkt-col-label">גמר</div>
          <div className="bkt-final-wrap">
            {MC(FINAL_ID)}
            <div className="bkt-trophy" aria-hidden>🏆</div>
          </div>
          <div className="bkt-third-label">מקום שלישי</div>
          <div className="bkt-third-wrap">
            {MC(THIRD_ID)}
          </div>
        </div>

        {/* Right half */}
        <HalfBracket
          side="right"
          r32Pairs={[
            /* RIGHT-TOP (feeds R16 M093): BRA/JPN + CIV/NOR */
            ["M074","M077"],
            /* RIGHT-TOP (feeds R16 M094): MEX/TBD + ENG/TBD */
            ["M079","M080"],
            /* RIGHT-BOTTOM (feeds R16 M095): ARG/CPV + AUS/EGY */
            ["M087","M086"],
            /* RIGHT-BOTTOM (feeds R16 M096): SUI/TBD + K1/TBD */
            ["M085","M088"],
          ]}
          r16Ids={["M093","M094","M095","M096"]}
          qfIds={["M099","M100"]}
          sfId="M102"
          {...props}
        />
      </div>

      {/* ---- Mobile: stacked round list ---- */}
      <div className="bkt-mobile">
        {[
          { label: "שלב 32", ids: R32 },
          { label: "שמינית גמר", ids: R16 },
          { label: "רבע גמר", ids: QF },
          { label: "חצי גמר", ids: SF },
          { label: "מקום שלישי", ids: [THIRD_ID] },
          { label: "גמר", ids: [FINAL_ID] },
        ].map(({ label, ids }) => (
          <div key={label} className="bkt-mob-round">
            <h3 className="bkt-mob-round-label">{label}</h3>
            <div className="bkt-mob-matches">
              {ids.map(id => (
                <MatchCard key={id} id={id} resolved={resolved} results={matchResults} liveScores={liveScores} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
