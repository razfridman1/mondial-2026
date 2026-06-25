"use client";
import { useMemo } from "react";
import { MATCHES, TEAMS, VENUES, STAGES } from "@/lib/data";
import { useStore } from "@/lib/store";
import { formatIsraelDate, formatIsraelTime, matchLiveStatus } from "@/lib/utils";
import { resolveAllStages } from "@/lib/bracket";

const STAGE_ORDER = ["R32","R16","QF","SF","THIRD","FINAL"] as const;
type KoStage = typeof STAGE_ORDER[number];

const STAGE_TITLES: Record<KoStage, string> = {
  R32: "שלב 32 האחרונות", R16: "שמינית גמר",
  QF: "רבע גמר", SF: "חצי גמר",
  THIRD: "מקום 3", FINAL: "הגמר",
};

function TeamSlot({ code, placeholder }: { code: string; placeholder?: string }) {
  const team = TEAMS[code];
  if (team) {
    return (
      <div className="br-team">
        <span className="br-team-flag">{team.flag}</span>
        <span className="br-team-name">{team.name}</span>
      </div>
    );
  }
  return (
    <div className="br-team br-team-tbd">
      <span className="br-team-flag">❓</span>
      <span className="br-team-name muted">{placeholder || code}</span>
    </div>
  );
}

export default function Bracket() {
  const matchResults = useStore(s => s.matchResults);
  const liveScores   = useStore(s => s.liveScores);

  const resolved = useMemo(() => resolveAllStages(matchResults), [matchResults]);

  const koMatches = useMemo(() =>
    MATCHES
      .filter(m => m.stage !== "GROUP")
      .sort((a, b) => +new Date(a.utc) - +new Date(b.utc)),
    []
  );

  const byStage = useMemo(() => {
    const map = new Map<KoStage, typeof koMatches>();
    for (const s of STAGE_ORDER) map.set(s, []);
    for (const m of koMatches) {
      const list = map.get(m.stage as KoStage);
      if (list) list.push(m);
    }
    return map;
  }, [koMatches]);

  return (
    <div className="bracket">
      {STAGE_ORDER.map(stage => {
        const ms = byStage.get(stage) || [];
        return (
          <div key={stage} className="br-col">
            <h4 className="br-title">{STAGE_TITLES[stage]}</h4>
            {ms.map(m => {
              const res = resolved[m.id];
              const homeCode = res?.home || m.home;
              const awayCode = res?.away || m.away;
              const result   = matchResults[m.id];
              const live     = liveScores[m.id];
              const status   = matchLiveStatus(m);
              const venue    = VENUES[m.venue];
              const isLive   = status === "live" || status === "pregame";
              const isDone   = !!result;
              const liveFT   = /^(FT|הסתיים)/i.test(live?.minuteLabel ?? "");

              const homeIsReal = !!TEAMS[homeCode];
              const awayIsReal = !!TEAMS[awayCode];

              // Score display: real result > live score > nothing
              const showScore = isDone || (live && (isLive || liveFT));
              const scoreHome = isDone ? result.home : (live?.home ?? "–");
              const scoreAway = isDone ? result.away : (live?.away ?? "–");

              return (
                <div key={m.id} className={`br-match${isDone ? " br-done" : isLive ? " br-live" : ""}`}>
                  {/* Status badge */}
                  {status === "live" && (
                    <div className="br-badge br-badge-live">
                      <span className="mt-live-dot" aria-hidden /> חי · {live?.minuteLabel || ""}
                    </div>
                  )}
                  {status === "pregame" && <div className="br-badge br-badge-pre">קדם-משחק</div>}
                  {isDone && <div className="br-badge br-badge-done">הסתיים</div>}

                  {/* Teams + score */}
                  <div className="br-teams-score">
                    <div className="br-teams">
                      <TeamSlot code={homeCode} placeholder={m.home} />
                      <TeamSlot code={awayCode} placeholder={m.away} />
                    </div>
                    {showScore && (
                      <div className={`br-score${isDone ? "" : " br-score-live"}`}>
                        <span>{scoreHome}</span>
                        <span className="br-score-sep">:</span>
                        <span>{scoreAway}</span>
                      </div>
                    )}
                  </div>

                  {/* Winner indicator */}
                  {isDone && res?.winner && TEAMS[res.winner] && (
                    <div className="br-winner">
                      {TEAMS[res.winner].flag} {TEAMS[res.winner].name} עברה הלאה
                    </div>
                  )}

                  {/* Date / time / venue */}
                  <div className="br-meta">
                    <span className="br-meta-date">
                      {formatIsraelDate(m.utc, { short: true })} · {formatIsraelTime(m.utc)}
                    </span>
                    {venue && (
                      <span className="br-meta-venue">
                        🏟 {venue.name}{venue.city ? ` · ${venue.city}` : ""}
                      </span>
                    )}
                    {(!homeIsReal || !awayIsReal) && (
                      <span className="br-meta-pending muted">
                        {!homeIsReal && !awayIsReal ? "שתי הנבחרות טרם נקבעו"
                         : !homeIsReal ? `${m.home} טרם נקבעה`
                         : `${m.away} טרם נקבעה`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
