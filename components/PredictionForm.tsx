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

  const [home, setHome] = useState<string>("");
  const [away, setAway] = useState<string>("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    }
  }, [existing?.matchId]);

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
    setError(null);
    try {
      await setPrediction(match.id, h, a, false);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 3000);
    } catch (e: any) {
      setError(e.message || "שגיאה בשמירה");
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

      <div className="mc-actions" style={{ marginTop: 8 }}>
        <button className="btn btn-primary" onClick={save} disabled={locked || !user}>
          {existing ? "💾 עדכן ניחוש" : "💾 שמור ניחוש"}
        </button>
        <button className="btn wa-btn" onClick={shareWA}>
          💬 שתף בווטסאפ
        </button>
        <button className="btn" onClick={async () => {
          const { openShareCard } = await import("@/lib/share-cards");
          const h = parseInt(home, 10) || 0;
          const a = parseInt(away, 10) || 0;
          openShareCard("prediction", { match, home: h, away: a, joker: false });
        }}>
          📷 שתף באינסטה
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
