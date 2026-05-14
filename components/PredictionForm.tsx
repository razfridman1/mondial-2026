"use client";
import { useEffect, useMemo, useState } from "react";
import { TEAMS } from "@/lib/data";
import { useStore } from "@/lib/store";
import { shareToWhatsApp, predictionShareText } from "@/lib/share";
import type { Match } from "@/lib/types";

const LOCK_MINUTES = 3;

export default function PredictionForm({ match }: { match: Match }) {
  const user = useStore(s => s.user);
  const existing = useStore(s => s.predictions[match.id]);
  const setPrediction = useStore(s => s.setPrediction);
  const clearPrediction = useStore(s => s.clearPrediction);

  const [home, setHome] = useState<string>("");
  const [away, setAway] = useState<string>("");
  const [winner, setWinner] = useState<string>(""); // KO only — team code that advances
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isKnockout = match.stage !== "GROUP";

  /* live countdown to compute lock */
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const startMs = useMemo(() => new Date(match.utc).getTime(), [match.utc]);
  const lockAt = startMs - LOCK_MINUTES * 60 * 1000;
  const locked = now >= lockAt;
  const minsToLock = Math.max(0, Math.floor((lockAt - now) / 60000));

  /* preload existing prediction */
  useEffect(() => {
    if (existing) {
      setHome(String(existing.homeScore));
      setAway(String(existing.awayScore));
      if ((existing as any).predictedWinner) setWinner((existing as any).predictedWinner);
    }
  }, [existing?.matchId]);

  /* Auto-derive winner from score whenever score isn't tied (KO only). */
  useEffect(() => {
    if (!isKnockout) return;
    const h = parseInt(home, 10);
    const a = parseInt(away, 10);
    if (!Number.isNaN(h) && !Number.isNaN(a)) {
      if (h > a) setWinner(match.home);
      else if (a > h) setWinner(match.away);
      /* tie → leave winner as user's manual pick */
    }
  }, [home, away, isKnockout, match.home, match.away]);

  const homeTeam = TEAMS[match.home] || { name: match.home, flag: "❓" };
  const awayTeam = TEAMS[match.away] || { name: match.away, flag: "❓" };

  async function save() {
    if (locked) { setError("הניחוש נעול — נסגר 3 דקות לפני שריקת הפתיחה."); return; }
    if (!user)   { setError("צריך להתחבר כדי לשמור ניחוש."); return; }
    const h = parseInt(home, 10);
    const a = parseInt(away, 10);
    if (Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0 || h > 20 || a > 20) {
      setError("הזן ערך תקין בין 0 ל-20.");
      return;
    }
    /* For knockout matches we also need a winner. If the 90-min score
     * isn't tied, derive it; otherwise the user must explicitly pick. */
    let pickedWinner: string | undefined;
    if (isKnockout) {
      if (h > a)      pickedWinner = match.home;
      else if (a > h) pickedWinner = match.away;
      else            pickedWinner = winner;
      if (!pickedWinner) {
        setError("בנוקאאוט: 90 דק׳ הסתיימו בתיקו לפי הניחוש שלך — בחר מי תעלה לאחר הארכה/פנדלים.");
        return;
      }
    }
    setError(null);
    try {
      await setPrediction(match.id, h, a, false, pickedWinner);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 3000);
    } catch (e: any) {
      setError(e.message || "שגיאה בשמירה");
    }
  }

  async function clearMyPrediction() {
    if (locked) { setError("הניחוש נעול — לא ניתן למחוק יותר."); return; }
    if (!existing) return;
    if (!confirm("למחוק את הניחוש שלך למשחק זה?")) return;
    setError(null);
    try {
      await clearPrediction(match.id);
      setHome(""); setAway(""); setWinner("");
    } catch (e: any) {
      setError(e?.message || "שגיאה במחיקה");
    }
  }

  async function shareWA() {
    const h = parseInt(home, 10) || 0;
    const a = parseInt(away, 10) || 0;
    await shareToWhatsApp(predictionShareText(match, h, a));
  }

  return (
    <div className="prediction-box">
      <h4>🔮 הניחוש שלך</h4>
      <div className="pred-form">
        <div className="pred-team">{homeTeam.flag} {homeTeam.name}</div>
        <input
          className="pred-input"
          type="number" inputMode="numeric" min={0} max={20}
          value={home}
          disabled={locked}
          onChange={e => setHome(e.target.value)}
          aria-label={`שערי ${homeTeam.name}`}
        />
        <span className="pred-dash">:</span>
        <input
          className="pred-input"
          type="number" inputMode="numeric" min={0} max={20}
          value={away}
          disabled={locked}
          onChange={e => setAway(e.target.value)}
          aria-label={`שערי ${awayTeam.name}`}
        />
        <div className="pred-team">{awayTeam.name} {awayTeam.flag}</div>
      </div>

      {/* KO-only: explicit winner picker for tied 90-min predictions */}
      {isKnockout && (() => {
        const h = parseInt(home, 10);
        const a = parseInt(away, 10);
        const isTied = !Number.isNaN(h) && !Number.isNaN(a) && h === a;
        return (
          <div className="pred-winner-block" style={{ marginTop: 10 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              ⚽ נוקאאוט — אין תיקו. בחר מי תעלה (אם 90 דק׳ הסתיימו בתיקו: הארכה/פנדלים יכריעו):
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className={`btn btn-small ${winner === match.home ? "btn-primary" : ""}`}
                onClick={() => setWinner(match.home)}
                disabled={locked}
                style={{ fontWeight: winner === match.home ? 800 : 500 }}>
                {homeTeam.flag} {homeTeam.name}
              </button>
              <button
                type="button"
                className={`btn btn-small ${winner === match.away ? "btn-primary" : ""}`}
                onClick={() => setWinner(match.away)}
                disabled={locked}
                style={{ fontWeight: winner === match.away ? 800 : 500 }}>
                {awayTeam.flag} {awayTeam.name}
              </button>
            </div>
            {isTied && !winner && (
              <div className="pred-msg is-locked" style={{ marginTop: 6, fontSize: 12 }}>
                ⚠ ניחוש 90 דק׳ בתיקו — חובה לבחור מנצחת
              </div>
            )}
          </div>
        );
      })()}

      <div className="mc-actions" style={{ marginTop: 8 }}>
        <button className="btn btn-primary" onClick={save} disabled={locked || !user}>
          {existing ? "💾 עדכן ניחוש" : "💾 שמור ניחוש"}
        </button>
        {existing && !locked && (
          <button className="btn" onClick={clearMyPrediction}
                  style={{ background: "rgba(239,68,68,0.12)", borderColor: "var(--red)", color: "var(--red)" }}>
            🗑 נקה ניחוש
          </button>
        )}
        <button className="btn wa-btn" onClick={shareWA}>
          💬 שתף בווטסאפ
        </button>
        <button className="btn" onClick={async () => {
          const { openShareCard } = await import("@/lib/share-cards");
          const h = parseInt(home, 10) || 0;
          const a = parseInt(away, 10) || 0;
          openShareCard("prediction", { match, home: h, away: a, joker: false });
        }}>
          📷 שתף בסטורי באינסטה
        </button>
      </div>

      {!user && (
        <div className="pred-msg">צריך להתחבר כדי לשמור ניחוש.</div>
      )}
      {existing && !locked && !savedAt && (
        <div className="pred-msg is-saved">
          ✓ ניחוש שמור: {existing.homeScore} : {existing.awayScore} · ניתן לעדכן עד {LOCK_MINUTES} דק׳ לפני המשחק
        </div>
      )}
      {savedAt && (
        <div className="pred-msg is-saved">✓ נשמר בהצלחה!</div>
      )}
      {locked && (
        <div className="pred-msg is-locked">
          🔒 הניחוש נעול — לא ניתן לעדכן יותר ({existing ? `נשמר: ${existing.homeScore} : ${existing.awayScore}` : "לא הוזן"}).
        </div>
      )}
      {!locked && minsToLock <= 30 && (
        <div className="pred-msg is-locked">
          ⚠ הניחוש ייעל בעוד {minsToLock} דק׳
        </div>
      )}
      {error && <div className="pred-msg is-locked">{error}</div>}
    </div>
  );
}
