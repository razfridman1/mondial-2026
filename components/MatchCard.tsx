"use client";
import { useMemo, useState } from "react";
import { TEAMS, VENUES, CHANNELS, STAGES } from "@/lib/data";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";
import {
  formatIsraelDate, formatIsraelTime, matchLiveStatus, relativeLabel, oddsToProbabilities,
} from "@/lib/utils";
import { shareToWhatsApp, matchShareText } from "@/lib/share";
import { scorePrediction } from "@/lib/scoring";
import { computeGroupStandings } from "@/lib/standings";
import type { Match } from "@/lib/types";
import Countdown from "./Countdown";

export default function MatchCard({ match, onOpen, live }: { match: Match; onOpen: (id: string) => void; live?: import("@/lib/store").LiveScore }) {
  const home = TEAMS[match.home] || { code: match.home, name: match.home, flag: "❓" };
  const away = TEAMS[match.away] || { code: match.away, name: match.away, flag: "❓" };
  const venue = VENUES[match.venue] || { name: match.venue, city: "", country: "", flag: "" };
  const stage = STAGES[match.stage];
  const channels = (match.channels || []).map(c => CHANNELS[c]).filter(Boolean);
  const status = matchLiveStatus(match);
  const rel = relativeLabel(match.utc);

  /* Live clock fallback (minutes since kickoff) — used when the AI live
   * ticker (live_data/live_scores) hasn't produced a minuteLabel yet. */
  const liveMinuteFallback = useMemo(() => {
    if (status !== "live") return null;
    const m = Math.floor((Date.now() - +new Date(match.utc)) / 60000);
    // Rough estimate only (used until the AI live ticker provides a real
    // minuteLabel): first half ~45', then a ~15' halftime break before the
    // second half kicks off, so wall-clock minute 45-60 is shown as "HT".
    if (m < 45) return `${m}'`;
    if (m < 60) return "HT";
    const second = m - 15; // second-half game minute, after the HT break
    if (second >= 105) return "FT?";
    if (second >= 90) return `90+${second - 90}`;
    return `${second}'`;
  }, [status, match.utc]);
  const liveClockLabel = (status === "live" && live?.minuteLabel) || liveMinuteFallback;

  /* Goals scored so far (live ticker), sorted by minute. */
  const liveGoals = useMemo(() => {
    const goals = live?.goals;
    if (status !== "live" || !goals || goals.length === 0) return [];
    return [...goals].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
  }, [status, live]);

  /* Pull user's prediction + actual result for this match (if any) */
  const myPrediction = useStore(s => s.predictions[match.id]);
  const matchResult  = useStore(s => s.matchResults[match.id]);
  const matchResults = useStore(s => s.matchResults);
  const user = useStore(s => s.user);
  const refreshMatchResults = useStore(s => s.refreshMatchResults);
  const currentGroupId = useStore(s => s.currentGroupId);
  const groups = useStore(s => s.groups);
  const [sharingPreds, setSharingPreds] = useState(false);

  /* Admin-only inline "set final result" editor — lets the admin record
   * the final score directly from the match card the moment a match ends,
   * without going to the Super-Admin panel. Writes to match_results via
   * /api/admin/results, which immediately updates this card + the
   * leaderboard for everyone (no fictional data — only what the admin
   * enters as the real final result). */
  const [editingResult, setEditingResult] = useState(false);
  const [resultHome, setResultHome] = useState("");
  const [resultAway, setResultAway] = useState("");
  const [savingResult, setSavingResult] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);

  function openResultEditor(e: React.MouseEvent) {
    e.stopPropagation();
    setResultHome(matchResult ? String(matchResult.home) : "");
    setResultAway(matchResult ? String(matchResult.away) : "");
    setResultError(null);
    setEditingResult(true);
  }
  function closeResultEditor(e: React.MouseEvent) {
    e.stopPropagation();
    setEditingResult(false);
    setResultError(null);
  }
  async function saveResult(e: React.MouseEvent) {
    e.stopPropagation();
    const home = Number(resultHome);
    const away = Number(resultAway);
    if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0) {
      setResultError("הזן תוצאה תקינה");
      return;
    }
    setSavingResult(true);
    setResultError(null);
    try {
      const token = await getFirebase().auth!.currentUser!.getIdToken();
      const r = await fetch("/api/admin/results", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ matchId: match.id, home, away }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setResultError(data.error || "שגיאה בשמירה");
        return;
      }
      await refreshMatchResults();
      setEditingResult(false);
    } catch {
      setResultError("שגיאה בשמירה");
    } finally {
      setSavingResult(false);
    }
  }
  async function deleteResult(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("למחוק את התוצאה הסופית של המשחק?")) return;
    setSavingResult(true);
    try {
      const token = await getFirebase().auth!.currentUser!.getIdToken();
      await fetch("/api/admin/results", {
        method: "DELETE",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ matchId: match.id }),
      });
      await refreshMatchResults();
      setEditingResult(false);
    } finally {
      setSavingResult(false);
    }
  }

  /* "שתף ניחושים" — once the match is live (or finished), let the user
   * share the whole group's predictions for it as a card image, reusing
   * /api/group-predictions scoped to the currently-selected group. */
  async function sharePredictions(e: React.MouseEvent) {
    e.stopPropagation();
    if (!currentGroupId || !user) return;
    setSharingPreds(true);
    try {
      const token = await getFirebase().auth!.currentUser!.getIdToken();
      const r = await fetch(`/api/group-predictions?groupId=${currentGroupId}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
      const data = await r.json();
      const row = (data.rows || []).find((x: any) => x.matchId === match.id);
      const preds = row?.predictions || [];
      const groupName = groups.find(g => g.id === currentGroupId)?.name;
      const { openMatchPredictionsShareCard } = await import("@/lib/share-cards");
      openMatchPredictionsShareCard(match, preds, groupName ? groupName.replace(/^[🌍🏆📊]+\s*/, "") : null, {
        result: matchResult ? { home: matchResult.home, away: matchResult.away, winner: matchResult.winner } : null,
        isKnockout: match.stage !== "GROUP",
      });
    } catch {
      alert("שגיאה בטעינת הניחושים לשיתוף");
    } finally {
      setSharingPreds(false);
    }
  }

  /* Mini group-standings table (real data via lib/standings.ts, computed
   * from match_results). Only shown for group-stage matches. */
  const groupStandings = useMemo(() => {
    if (match.stage !== "GROUP" || !match.group) return null;
    return computeGroupStandings(match.group, matchResults);
  }, [match.stage, match.group, matchResults]);

  /* Standard table order — 1st place first, then 2nd, etc. (same as the
   * full standings tab). The home team's row is still highlighted via
   * the "is-home" class, just in its real table position. */
  const displayStandings = groupStandings;

  const minutesToKick = useMemo(
    () => Math.round((new Date(match.utc).getTime() - Date.now()) / 60000),
    [match.utc]
  );
  const predictionLocked = minutesToKick <= 3;
  /* A result existing in the DB *is* the source of truth for "finished".
   * In simulation, "instant results" writes results to matches whose clock
   * hasn't reached kickoff yet, so we must not gate on matchLiveStatus. */
  const isFinished = !!matchResult;

  const isKnockout = match.stage !== "GROUP";

  /* Compute score if both prediction and result available */
  const myScore = useMemo(() => {
    if (!myPrediction || !matchResult) return null;
    return scorePrediction({
      predictedHome: myPrediction.homeScore,
      predictedAway: myPrediction.awayScore,
      actualHome: matchResult.home,
      actualAway: matchResult.away,
      predictedWinner: (myPrediction as any).predictedWinner ?? null,
      actualWinner:    (matchResult as any).winner ?? null,
      isKnockout,
    });
  }, [myPrediction, matchResult, isKnockout]);

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
             data-finished={isFinished ? "true" : undefined}
             onClick={onCardClick}
             onKeyDown={(e) => { if (e.key === "Enter") onOpen(match.id); }}
             role="button" tabIndex={0}
             aria-label="פתח פרטי משחק">
      <header className="mc-header">
        <div className="mc-stage">
          <span className="chip chip-stage">{stage?.name}{match.group ? ` · בית ${match.group}` : ""}</span>
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
          {status === "live" ? (
            <>
              <div className="mc-live-score">
                <span className="mc-live-score-num">{live ? live.home : "–"}</span>
                <span className="mc-live-score-sep">:</span>
                <span className="mc-live-score-num">{live ? live.away : "–"}</span>
              </div>
              <div className="vs-label mc-live-clock">
                <span className="mt-live-dot" aria-hidden /> {liveClockLabel}
              </div>
            </>
          ) : (
            <>
              <div className="vs-line"></div>
              <Countdown utc={match.utc} className="vs-cd" />
              <div className="vs-label">נגד</div>
            </>
          )}
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

      {liveGoals.length > 0 && (
        <div className="mc-live-goals">
          {liveGoals.map((g, i) => {
            const team = g.team === "away" ? away : home;
            return (
              <span key={i} className="mc-live-goal">
                ⚽ {g.minute != null ? `${g.minute}'` : ""} {g.player || ""} ({team.flag})
              </span>
            );
          })}
        </div>
      )}

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
        ) : !predictionLocked && myPrediction ? (
          /* Open + has prediction → show it with a change button */
          <div className="pred-result-stack">
            <div className="pred-result-row">
              <span className="pred-result-key">🔮 הניחוש שלי:</span>
              <span className="pred-result-val">{myPrediction.homeScore} : {myPrediction.awayScore}</span>
              <button
                className="btn btn-small"
                style={{ marginInlineStart: 8, fontSize: 11, padding: "2px 8px" }}
                onClick={(e) => { e.stopPropagation(); onOpen(match.id); }}
                title="שנה ניחוש"
              >
                ✏️ שינוי
              </button>
            </div>
          </div>
        ) : (
          /* Open (>3 min) or locked w/o prediction */
          <span className={`status-pill ${predictionLocked ? "pill-locked" : "pill-open"}`}>
            {predictionLocked ? "🔒 תם הזמן לסמן ניחוש" : "🔮 לחץ כדי למלא"}
          </span>
        )}
      </div>

      {/* Admin-only: set/edit/clear the real final result directly on the card. */}
      {user?.isAdmin && (
        <div className="mc-admin-result" onClick={stop} style={{ marginTop: 8 }}>
          {editingResult ? (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
              <span className="muted" style={{ fontSize: 12 }}>🏁 תוצאה סופית:</span>
              <input
                type="number" min={0} max={30} value={resultHome}
                onChange={e => setResultHome(e.target.value)}
                style={{ width: 50, padding: "2px 4px" }}
                disabled={savingResult}
              />
              <span className="muted">:</span>
              <input
                type="number" min={0} max={30} value={resultAway}
                onChange={e => setResultAway(e.target.value)}
                style={{ width: 50, padding: "2px 4px" }}
                disabled={savingResult}
              />
              <button className="btn btn-small btn-primary" onClick={saveResult} disabled={savingResult}>
                {savingResult ? "…שומר" : "💾 שמור"}
              </button>
              {matchResult && (
                <button className="btn btn-small" onClick={deleteResult} disabled={savingResult} style={{ color: "var(--red)" }}>
                  🗑️ מחק
                </button>
              )}
              <button className="btn btn-small" onClick={closeResultEditor} disabled={savingResult}>ביטול</button>
              {resultError && <span style={{ color: "var(--red)", fontSize: 12 }}>{resultError}</span>}
            </div>
          ) : (
            <button className="btn btn-small" onClick={openResultEditor} title="הזן/עדכן את התוצאה הסופית האמיתית של המשחק">
              {isFinished ? "✏️ ערוך תוצאה (אדמין)" : "🏁 הזן תוצאה סופית (אדמין)"}
            </button>
          )}
        </div>
      )}

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

      {displayStandings && (
        <div className="mc-group-table">
          <div className="mc-group-table-title">📋 טבלת בית {match.group}</div>
          <table className="mc-mini-table">
            <thead>
              <tr>
                <th className="mmt-th-pos">#</th>
                <th className="mmt-th-team">נבחרת</th>
                <th>מ</th>
                <th>נק&apos;</th>
              </tr>
            </thead>
            <tbody>
              {displayStandings.map(s => (
                <tr key={s.teamCode} className={`mmt-row ${s.teamCode === match.home ? "is-home" : ""}`}>
                  <td className="mmt-pos">{s.position}</td>
                  <td className="mmt-team">
                    <span className="mmt-flag">{s.teamFlag}</span>
                    <span className="mmt-name">{s.teamName}</span>
                  </td>
                  <td>{s.played}</td>
                  <td><strong>{s.points}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
        {(status === "live" || isFinished) && currentGroupId && (
          <button className="btn btn-small wa-btn" onClick={sharePredictions} disabled={sharingPreds} title="שתף את ניחושי הקבוצה למשחק הזה">
            {sharingPreds ? "…טוען" : "📤 שתף ניחושי הקבוצה"}
          </button>
        )}
      </div>
    </article>
  );
}
