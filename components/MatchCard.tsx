"use client";
import { useMemo } from "react";
import { TEAMS, VENUES, CHANNELS, STAGES } from "@/lib/data";
import { useStore } from "@/lib/store";
import {
  formatIsraelDate, formatIsraelTime, matchLiveStatus, relativeLabel, oddsToProbabilities,
} from "@/lib/utils";
import { shareToWhatsApp, matchShareText } from "@/lib/share";
import { scorePrediction } from "@/lib/scoring";
import type { Match } from "@/lib/types";
import Countdown from "./Countdown";

export default function MatchCard({ match, onOpen }: { match: Match; onOpen: (id: string) => void }) {
  const home = TEAMS[match.home] || { code: match.home, name: match.home, flag: "❓" };
  const away = TEAMS[match.away] || { code: match.away, name: match.away, flag: "❓" };
  const venue = VENUES[match.venue] || { name: match.venue, city: "", country: "", flag: "" };
  const stage = STAGES[match.stage];
  const channels = (match.channels || []).map(c => CHANNELS[c]).filter(Boolean);
  const status = matchLiveStatus(match);
  const rel = relativeLabel(match.utc);

  /* Pull user's prediction + actual result for this match (if any) */
  const myPrediction = useStore(s => s.predictions[match.id]);
  const matchResult  = useStore(s => s.matchResults[match.id]);

  const minutesToKick = useMemo(
    () => Math.round((new Date(match.utc).getTime() - Date.now()) / 60000),
    [match.utc]
  );
  const predictionLocked = minutesToKick <= 3;
  /* A result existing in the DB *is* the source of truth for "finished".
   * In simulation, "instant results" writes results to matches whose clock
   * hasn't reached kickoff yet, so we must not gate on matchLiveStatus. */
  const isFinished = !!matchResult;

  /* Compute score if both prediction and result available */
  const myScore = useMemo(() => {
    if (!myPrediction || !matchResult) return null;
    return scorePrediction({
      predictedHome: myPrediction.homeScore,
      predictedAway: myPrediction.awayScore,
      actualHome: matchResult.home,
      actualAway: matchResult.away,
    });
  }, [myPrediction, matchResult]);

  function scoreLabel(): string {
    if (!myScore) return "";
    if (myScore.exact)          return "🎯 פגיעה + תוצאה";
    if (myScore.resultCorrect)  return myScore.diffCorrect ? "✅ פגיעה + הפרש שערים" : "✅ פגיעה";
    return "❌ פספוס";
  }

  // Whole-card click handler. Inner interactive controls call stopPropagation
  // (or are wrapped in <a>) so they don't trigger the modal.
  function onCardClick(e: React.MouseEvent) {
    // Ignore clicks bubbling from links/buttons inside
    const t = e.target as HTMLElement;
    if (t.closest("a, button")) return;
    onOpen(match.id);
  }
  function stop(e: React.MouseEvent) { e.stopPropagation(); }

  return (
    <article className={`match-card status-${status} is-clickable`} data-match-id={match.id}
             onClick={onCardClick}
             onKeyDown={(e) => { if (e.key === "Enter") onOpen(match.id); }}
             role="button" tabIndex={0}
             aria-label="פתח פרטי משחק">
      <header className="mc-header">
        <div className="mc-stage">
          <span className="chip">{stage?.name}{match.group ? ` · בית ${match.group}` : ""}</span>
          {rel && <span className="chip chip-soft">{rel}</span>}
          {status === "live"    && <span className="badge badge-live">🔴 שידור חי</span>}
          {status === "pregame" && <span className="badge badge-pregame">קדם-משחק</span>}
          {status === "finished"&& <span className="badge badge-finished">הסתיים</span>}
        </div>
        <div className="mc-time">
          <div className="mc-time-time">{formatIsraelTime(match.utc)}</div>
          <div className="mc-time-date">{formatIsraelDate(match.utc, { short: true })}</div>
        </div>
      </header>

      {/* Mobile-only: prominent day + date banner inside the card */}
      <div className="mc-date-mobile">
        📅 {formatIsraelDate(match.utc)}
      </div>

      <div className="mc-body">
        <div className="team team-home">
          <span className="flag">{home.flag}</span>
          <span className="team-name">{home.name}</span>
        </div>
        <div className="mc-vs">
          <div className="vs-line"></div>
          <Countdown utc={match.utc} className="vs-cd" />
          <div className="vs-label">נגד</div>
        </div>
        <div className="team team-away">
          <span className="team-name">{away.name}</span>
          <span className="flag">{away.flag}</span>
        </div>
      </div>

      <div className="mc-venue">
        <span>🏟️ {venue.name}</span>
        <span>📍 {venue.city}{venue.country ? ", " + venue.country : ""} {venue.flag || ""}</span>
      </div>

      <div className="status-chips">
        {isFinished && myPrediction ? (
          /* Match finished: show prediction + actual + score earned */
          <div className="pred-result-stack">
            <div className="pred-result-row">
              <span className="pred-result-key">🔮 ההימור שלך:</span>
              <span className="pred-result-val">{myPrediction.homeScore} : {myPrediction.awayScore}</span>
            </div>
            <div className="pred-result-row">
              <span className="pred-result-key">🏁 תוצאה:</span>
              <span className="pred-result-val">{matchResult.home} : {matchResult.away}</span>
            </div>
            <div className={`pred-result-row pred-result-points ${myScore && myScore.points > 0 ? "pos" : "zero"}`}>
              <span className="pred-result-tag">{scoreLabel()}</span>
              <span className="pred-result-key">ניקוד: {myScore?.points ?? 0}</span>
            </div>
          </div>
        ) : isFinished && !myPrediction ? (
          /* Match finished but no prediction */
          <div className="pred-result-stack">
            <div className="pred-result-row">
              <span className="pred-result-key">🏁 תוצאה:</span>
              <span className="pred-result-val">{matchResult.home} : {matchResult.away}</span>
            </div>
            <div className="pred-result-row muted">
              <span>לא הוזן ניחוש למשחק זה</span>
            </div>
          </div>
        ) : predictionLocked && myPrediction ? (
          /* Locked (≤3 min to kickoff) WITH prediction → show user's pick */
          <div className="pred-result-stack">
            <div className="pred-result-row">
              <span className="pred-result-key">🔮 ההימור שלך:</span>
              <span className="pred-result-val">{myPrediction.homeScore} : {myPrediction.awayScore}</span>
            </div>
            <span className="status-pill pill-locked" style={{ marginTop: 4 }}>🔒 תם הזמן לסמן ניחוש</span>
          </div>
        ) : (
          /* Open (>3 min) or locked w/o prediction */
          <span className={`status-pill ${predictionLocked ? "pill-locked" : "pill-open"}`}>
            {predictionLocked ? "🔒 תם הזמן לסמן ניחוש" : "🔮 לחץ כדי למלא"}
          </span>
        )}
      </div>

      {(() => {
        const p = oddsToProbabilities(match.odds);
        if (!p) return null;
        return (
          <div className="odds hide-on-mobile">
            <div className="odd"><span className="odd-k">1</span><span className="odd-v">{p.home}%</span></div>
            <div className="odd"><span className="odd-k">X</span><span className="odd-v">{p.draw}%</span></div>
            <div className="odd"><span className="odd-k">2</span><span className="odd-v">{p.away}%</span></div>
          </div>
        );
      })()}

      <div className="mc-broadcast">
        <div className="bc-label">שידור בישראל:</div>
        <div className="bc-chips">
          {channels.length ? channels.map(c => (
            <span key={c.id} className="channel-chip is-static" style={{ ["--ch" as any]: c.color }}>
              <span className="channel-logo">{c.logo}</span><span>{c.name}</span>
            </span>
          )) : <span className="muted">טרם נקבע</span>}
        </div>
        {match.studioShow && (
          <div className="bc-studio">🎬 {match.studioShow} · קדם-משחק {match.preGameMinutes} דק׳ לפני שריקת הפתיחה</div>
        )}
      </div>

      <div className="mc-actions mc-actions-row">
        {(status === "live" || status === "pregame" || status === "finished") && (
          <a className="btn btn-watch" href={channels[0]?.url || "#"} target="_blank" rel="noopener" onClick={stop}>
            {status === "live"    ? "▶ צפה"
            : status === "pregame" ? "▶ קדם"
            :                        "🎞️ שיא"}
          </a>
        )}
        <button className="btn btn-icon wa-btn"
                onClick={(e) => { stop(e); shareToWhatsApp(matchShareText(match)); }}
                aria-label="שתף">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
          </svg>
        </button>
      </div>
    </article>
  );
}
