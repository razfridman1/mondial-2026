"use client";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { TEAMS, VENUES, STAGES } from "@/lib/data";
import { formatIsraelDate, formatIsraelTime, matchLiveStatus } from "@/lib/utils";
import { scorePrediction } from "@/lib/scoring";
import type { Match } from "@/lib/types";

export const LOCK_MIN = 3;

export type MatchResult = { home: number; away: number; finishedAt: number };

export function PredictionRow({
  match, prediction, result, now, onSaved, adminMode, onAdminSave, onAdminClear,
}: {
  match: Match;
  prediction: any;
  result: MatchResult | undefined;
  now: number;
  onSaved: () => void;
  /** Super-admin bypass: when true, editing is allowed regardless of the
   *  3-min lock and even after the match has finished, and saves/clears go
   *  through onAdminSave/onAdminClear instead of the caller's own store
   *  actions (so an admin can fix/fill any user's prediction). */
  adminMode?: boolean;
  onAdminSave?: (matchId: string, home: number, away: number, winner?: string) => Promise<void>;
  onAdminClear?: (matchId: string) => Promise<void>;
}) {
  const setPrediction = useStore(s => s.setPrediction);
  const clearPrediction = useStore(s => s.clearPrediction);
  const home = TEAMS[match.home] || { code: match.home, name: match.home, flag: "❓" };
  const away = TEAMS[match.away] || { code: match.away, name: match.away, flag: "❓" };
  const venue = VENUES[match.venue] || { name: "" };
  const isPlaceholder = match.homeIsPlaceholder || match.awayIsPlaceholder;
  const status = matchLiveStatus(match);
  const startMs = new Date(match.utc).getTime();
  const lockAt = startMs - LOCK_MIN * 60 * 1000;
  const locked = now >= lockAt;
  const editable = !locked || !!adminMode;
  const minsToLock = Math.max(0, Math.floor((lockAt - now) / 60000));

  const isKnockout = match.stage !== "GROUP";
  const [h, setH] = useState<string>(prediction?.homeScore != null ? String(prediction.homeScore) : "");
  const [a, setA] = useState<string>(prediction?.awayScore != null ? String(prediction.awayScore) : "");
  const [winnerCode, setWinnerCode] = useState<string>(
    (prediction as any)?.predictedWinner || ""
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (prediction) {
      setH(String(prediction.homeScore));
      setA(String(prediction.awayScore));
      setWinnerCode((prediction as any).predictedWinner || "");
    } else {
      // No prediction for this match (e.g. admin switched to a different
      // user who hasn't predicted it yet) — don't leave stale values shown.
      setH("");
      setA("");
      setWinnerCode("");
    }
  }, [prediction, prediction?.homeScore, prediction?.awayScore, (prediction as any)?.predictedWinner]);

  /* Auto-derive KO winner from score when not tied. */
  useEffect(() => {
    if (!isKnockout) return;
    const hi = parseInt(h, 10);
    const ai = parseInt(a, 10);
    if (Number.isNaN(hi) || Number.isNaN(ai)) return;
    if (hi > ai) setWinnerCode(match.home);
    else if (ai > hi) setWinnerCode(match.away);
  }, [h, a, isKnockout, match.home, match.away]);

  async function save(newH: string, newA: string, newWinner: string) {
    const hi = parseInt(newH, 10);
    const ai = parseInt(newA, 10);
    if (Number.isNaN(hi) || Number.isNaN(ai) || hi < 0 || ai < 0 || hi > 20 || ai > 20) return;
    if (isKnockout && hi === ai && !newWinner) return;
    if (prediction
        && hi === prediction.homeScore
        && ai === prediction.awayScore
        && (!isKnockout || newWinner === ((prediction as any).predictedWinner || ""))) {
      return;
    }
    setSaveState("saving");
    setErrMsg(null);
    try {
      if (adminMode && onAdminSave) {
        await onAdminSave(match.id, hi, ai, isKnockout ? newWinner : undefined);
      } else {
        await setPrediction(match.id, hi, ai, false, isKnockout ? newWinner : undefined);
      }
      setSaveState("saved");
      onSaved();
      setTimeout(() => setSaveState("idle"), 1500);
    } catch (e: any) {
      setSaveState("error");
      setErrMsg(e.message || "שגיאה");
    }
  }

  /* Debounced autosave */
  useEffect(() => {
    if (!editable || isPlaceholder) return;
    if (h === "" || a === "") return;
    if (isKnockout && !winnerCode) return;
    if (prediction
        && Number(h) === prediction.homeScore
        && Number(a) === prediction.awayScore
        && (!isKnockout || winnerCode === ((prediction as any).predictedWinner || ""))) return;
    const id = setTimeout(() => save(h, a, winnerCode), 700);
    return () => clearTimeout(id);
  }, [h, a, winnerCode]);

  /* Score breakdown if match finished */
  const score = useMemo(() => {
    if (!result || !prediction) return null;
    const isKO = match.stage !== "GROUP";
    return scorePrediction({
      predictedHome: prediction.homeScore,
      predictedAway: prediction.awayScore,
      actualHome: result.home, actualAway: result.away,
      predictedWinner: (prediction as any).predictedWinner ?? null,
      actualWinner:    (result as any).winner ?? null,
      isKnockout: isKO,
    });
  }, [result, prediction, match.stage]);

  /* ----- placeholder match ----- */
  if (isPlaceholder) {
    return (
      <div className="mypred-row mypred-row-locked">
        <div className="mypred-row-head">
          <span className="muted">{formatIsraelDate(match.utc, { short: true })} · {formatIsraelTime(match.utc)}</span>
          <span className="chip chip-soft">{STAGES[match.stage].name}</span>
        </div>
        <div className="mypred-row-teams muted" style={{ textAlign: "center", padding: "16px 0" }}>
          🔒 ימולא לאחר סיום השלב הקודם
        </div>
      </div>
    );
  }

  /* ----- finished match (admin bypasses this — falls through to the
   *        editable form below, with the actual result shown for context) ----- */
  if (result && !adminMode) {
    const hitClass = score && score.points > 0 ? "is-hit" : prediction ? "is-miss" : "is-noPred";
    return (
      <div className={`mypred-row mypred-row-finished ${hitClass}`}>
        <div className="mypred-row-head">
          <span className="muted">{formatIsraelDate(match.utc, { short: true })} · {formatIsraelTime(match.utc)}</span>
          <span className="badge badge-finished">הסתיים</span>
          <span className="chip chip-stage">
            {STAGES[match.stage].name}{match.group ? ` · בית ${match.group}` : ""}
          </span>
        </div>
        <div className="mypred-row-teams">
          <div className="mypred-team">
            <span className="flag">{home.flag}</span>
            <span className="team-name">{home.name}</span>
          </div>
          <div className="mypred-score-final">
            <strong>{result.home}</strong>
            <span className="mypred-dash">:</span>
            <strong>{result.away}</strong>
          </div>
          <div className="mypred-team mypred-team-away">
            <span className="team-name">{away.name}</span>
            <span className="flag">{away.flag}</span>
          </div>
        </div>
        {prediction ? (
          <div className="mypred-result-row">
            <span className="mypred-result-label">
              {prediction.auto ? "🤖 ניחוש אוטומטי:" : "🔮 ניחשת:"}
            </span>
            <span className="mypred-result-pred">{prediction.homeScore} : {prediction.awayScore}</span>
            <span className={`mypred-result-pts ${score!.points > 0 ? "pos" : "zero"}`}>
              ניקוד: {score!.points}
            </span>
            <span className="mypred-result-tag">
              {score!.exact
                ? "🎯 פגיעה + תוצאה"
                : score!.resultCorrect
                  ? (score!.diffCorrect ? "✅ פגיעה + הפרש שערים" : "✅ פגיעה")
                  : "❌ פספוס"}
            </span>
          </div>
        ) : (
          <div className="mypred-result-row muted">לא הוזן ניחוש למשחק הזה</div>
        )}
      </div>
    );
  }

  /* ----- upcoming / live / pregame match — inline input ----- */
  return (
    <div className={`mypred-row ${!editable ? "mypred-row-locked" : ""} ${status === "live" ? "mypred-row-live" : ""}`}>
      <div className="mypred-row-head">
        <span className="muted">{formatIsraelDate(match.utc, { short: true })} · {formatIsraelTime(match.utc)}</span>
        {status === "live"    && <span className="badge badge-live">🔴 שידור חי</span>}
        {status === "pregame" && <span className="badge badge-pregame">קדם-משחק</span>}
        {!locked && minsToLock <= 60 && minsToLock > 0 && (
          <span className="chip chip-strong">⚠ נעילה בעוד {minsToLock} דק׳</span>
        )}
        {adminMode && locked && (
          <span className="chip chip-strong" style={{ background: "rgba(34,197,94,0.15)", color: "var(--green, #22c55e)" }}>
            🛡️ מצב אדמין — עוקף נעילה
          </span>
        )}
        {result && (
          <span className="badge badge-finished">הסתיים · {result.home}:{result.away}</span>
        )}
        <span className="chip chip-stage">
          {STAGES[match.stage].name}{match.group ? ` · בית ${match.group}` : ""}
        </span>
        {venue.name && <span className="muted" style={{ fontSize: 11 }}>🏟️ {venue.name}</span>}
      </div>

      <div className="mypred-row-teams">
        <div className="mypred-team">
          <span className="flag">{home.flag}</span>
          <span className="team-name">{home.name}</span>
        </div>

        <div className="mypred-score-input">
          <input
            type="number" inputMode="numeric" min={0} max={20}
            value={h}
            disabled={!editable}
            onChange={e => setH(e.target.value)}
            aria-label={`שערי ${home.name}`}
          />
          <span className="mypred-dash">:</span>
          <input
            type="number" inputMode="numeric" min={0} max={20}
            value={a}
            disabled={!editable}
            onChange={e => setA(e.target.value)}
            aria-label={`שערי ${away.name}`}
          />
        </div>

        <div className="mypred-team mypred-team-away">
          <span className="team-name">{away.name}</span>
          <span className="flag">{away.flag}</span>
        </div>
      </div>

      {/* KO-only: explicit "who advances" picker */}
      {isKnockout && editable && (() => {
        const hi = parseInt(h, 10);
        const ai = parseInt(a, 10);
        const isTied = !Number.isNaN(hi) && !Number.isNaN(ai) && hi === ai;
        return (
          <div className="mypred-ko-winner">
            <span className="muted" style={{ fontSize: 12 }}>
              ⚽ מי תעלה? {isTied && <strong style={{ color: "var(--orange)" }}>חובה לבחור (90 דק׳ בתיקו)</strong>}
            </span>
            <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
              <button
                type="button"
                className={`btn btn-small ${winnerCode === match.home ? "btn-primary" : ""}`}
                onClick={() => setWinnerCode(match.home)}
                style={{ fontWeight: winnerCode === match.home ? 800 : 500, fontSize: 12 }}>
                {home.flag} {home.name}
              </button>
              <button
                type="button"
                className={`btn btn-small ${winnerCode === match.away ? "btn-primary" : ""}`}
                onClick={() => setWinnerCode(match.away)}
                style={{ fontWeight: winnerCode === match.away ? 800 : 500, fontSize: 12 }}>
                {away.flag} {away.name}
              </button>
            </div>
          </div>
        );
      })()}

      <div className="mypred-row-foot">
        {!editable ? (
          <span className="pred-msg is-locked" style={{ margin: 0 }}>
            🔒 נעול
            {prediction ? ` · נשמר: ${prediction.homeScore}:${prediction.awayScore}` : " · לא הוזן"}
            {isKnockout && prediction && (prediction as any).predictedWinner && (() => {
              const wc = (prediction as any).predictedWinner;
              const wt = TEAMS[wc];
              return ` · עולה: ${wt?.flag || ""} ${wt?.name || wc}`;
            })()}
            {prediction?.auto && " 🤖"}
          </span>
        ) : (
          <>
            {saveState === "saving" && <span className="mypred-save-state">💾 שומר…</span>}
            {saveState === "saved"  && <span className="mypred-save-state is-ok">✓ נשמר</span>}
            {saveState === "error"  && <span className="mypred-save-state is-err">⚠ {errMsg}</span>}
            {saveState === "idle"   && prediction && !adminMode && (
              <span className="muted mypred-save-state">ניתן לעדכן עד {LOCK_MIN} דק׳ לפני הפתיחה</span>
            )}
            {saveState === "idle"   && prediction && adminMode && (
              <span className="muted mypred-save-state">
                נשמר: {prediction.homeScore}:{prediction.awayScore}
                {prediction.editedByAdmin ? " (נערך ע\"י אדמין)" : prediction.auto ? " 🤖" : ""}
              </span>
            )}
            {saveState === "idle"   && !prediction && (h === "" || a === "") && (
              <span className="muted mypred-save-state">הזן ניחוש — נשמר אוטומטית</span>
            )}
            {prediction && (
              <button
                className="btn btn-small"
                style={{ background: "rgba(239,68,68,0.10)", borderColor: "var(--red)", color: "var(--red)", fontSize: 12 }}
                onClick={async () => {
                  if (!confirm("למחוק את הניחוש למשחק זה?")) return;
                  try {
                    if (adminMode && onAdminClear) {
                      await onAdminClear(match.id);
                    } else {
                      await clearPrediction(match.id);
                    }
                    setH(""); setA("");
                    onSaved();
                  } catch (e: any) {
                    setSaveState("error");
                    setErrMsg(e?.message || "שגיאה במחיקה");
                  }
                }}
                title="מחק את הניחוש"
              >
                🗑 נקה
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
