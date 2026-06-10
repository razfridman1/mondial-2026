"use client";
/* =====================================================================
 * TeamDetail — reusable per-team detail view (squad, formation, pitch).
 * Used by:
 *   - TeamsTab (inline page)
 *   - StandingsTab (modal overlay when a team row is clicked)
 * ===================================================================*/
import { useMemo } from "react";
import { squadFor, hasVerifiedSquad, squadStatus } from "@/lib/players";
import { defaultLineup, pickFormation } from "@/lib/lineups";
import { useStore } from "@/lib/store";
import Pitch from "./Pitch";
import type { Team } from "@/lib/types";

export default function TeamDetail({ team, onBack, backLabel = "← חזרה" }: {
  team: Team;
  onBack: () => void;
  backLabel?: string;
}) {
  const liveSquads = useStore(s => s.liveSquads);
  const squad     = useMemo(() => squadFor(team.code, liveSquads), [team.code, liveSquads]);
  const formation = useMemo(() => pickFormation(team.code), [team.code]);
  const lineup    = useMemo(() => defaultLineup(team.code, formation, liveSquads), [team.code, formation, liveSquads]);
  const verified  = hasVerifiedSquad(team.code, liveSquads);
  const status    = squadStatus(team.code, liveSquads);
  const isLive    = status === "live";

  const captain = squad.find(p => p.captain);
  const byPos = {
    GK:  squad.filter(p => p.position === "GK"),
    DEF: squad.filter(p => p.position === "DEF"),
    MID: squad.filter(p => p.position === "MID"),
    FWD: squad.filter(p => p.position === "FWD"),
  };

  return (
    <div className="team-detail">
      <button className="btn" onClick={onBack}>{backLabel}</button>

      <header className="team-header">
        <span className="team-header-flag">{team.flag}</span>
        <div>
          <h2 style={{ margin: 0 }}>{team.name}</h2>
          <div className="muted">
            בית {team.group} · {team.nameEn}
            {verified && ` · פורמציה צפויה: ${formation}`}
          </div>
          {captain && <div className="muted">קפטן (ראשוני): {captain.name}</div>}
        </div>
      </header>

      {!verified && (
        <div className="empty-state" style={{ marginTop: 16 }}>
          <strong>👥 סגל מורחב יתעדכן בקרוב</strong><br />
          <span className="muted">
            עדיין לא הוזן במערכת סגל מפורט עבור נבחרת זו.
            כדי לא להציג מידע שגוי, ההרכב יוצג רק לאחר עדכון הנתונים.<br />
            הסגל הרשמי ייטען אוטומטית ברגע שיהיה זמין מ-football-data.org.
          </span>
        </div>
      )}

      {verified && (
        <div className="pred-msg is-locked" style={{ marginTop: 10, textAlign: "center" }}>
          {isLive
            ? "🔴 סגל רשמי שנמשך בזמן אמת מ-football-data.org · שמות מוצגים באנגלית בלבד"
            : "⚠️ סגל ראשוני בלבד · ההרכב הסופי יפורסם רשמית קרוב למונדיאל."}
        </div>
      )}

      {verified && (
        <section style={{ marginTop: 18 }}>
          <h3>🏟️ הרכב פתיחה צפוי ({formation})</h3>
          <Pitch home={lineup} away={lineup} compact />
          <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>
            {isLive
              ? "ההרכב מבוסס על הסגל הרשמי ופורמציה ברירת מחדל (אין מספרי חולצה רשמיים); ההרכב הסופי יתעדכן ביום המשחק."
              : "ההרכב מבוסס על סגל ראשוני ופורמציה ברירת מחדל; ההרכב הסופי יתעדכן רשמית כקרוב למונדיאל."}
          </p>
        </section>
      )}

      {verified && (
        <section style={{ marginTop: 24 }}>
          <h3>👥 סגל {isLive ? "רשמי 🔴" : "ראשוני"} ({squad.length} שחקנים){!isLive && " — לא רשמי"}</h3>
          {(["GK", "DEF", "MID", "FWD"] as const).map(pos => (
            <div key={pos} className="squad-block">
              <h4 className="squad-block-title">
                {pos === "GK"  && "🧤 שוערים"}
                {pos === "DEF" && "🛡️ הגנה"}
                {pos === "MID" && "⚙️ קישור"}
                {pos === "FWD" && "🎯 התקפה"}
                <span className="muted"> · {byPos[pos].length}</span>
              </h4>
              <div className="squad-grid">
                {byPos[pos].map(p => (
                  <div key={p.id} className="player-card">
                    {p.jersey != null && <div className="player-jersey">#{p.jersey}</div>}
                    <div className="player-info">
                      <div className="player-name">
                        {p.name} {p.captain && <span title="קפטן" style={{ color: "var(--accent)" }}>(C)</span>}
                      </div>
                      <div className="muted player-meta">
                        {p.position}{p.age > 0 ? ` · גיל ${p.age}` : ""}{p.club ? ` · 🏟️ ${p.club}` : ""}
                      </div>
                      {p.description && <div className="player-desc">{p.description}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
