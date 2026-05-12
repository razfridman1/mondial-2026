"use client";
import { useMemo, useState } from "react";
import { TEAMS } from "@/lib/data";
import { teamsByGroup, squadFor, hasVerifiedSquad } from "@/lib/players";
import { defaultLineup, pickFormation } from "@/lib/lineups";
import Pitch from "./Pitch";
import type { Team } from "@/lib/types";

export default function TeamsTab() {
  const groups = useMemo(() => teamsByGroup(), []);
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);

  return (
    <section>
      {!activeTeam && (
        <>
          <h2 className="sec-title">🌍 12 הבתים · 48 הקבוצות במונדיאל 2026</h2>
          <div className="groups-grid">
            {Object.entries(groups).sort(([a],[b]) => a.localeCompare(b)).map(([letter, teams]) => (
              <section key={letter} className="group-card">
                <h3 className="group-title">בית {letter}</h3>
                <div className="group-teams">
                  {teams.map(t => {
                    const verified = hasVerifiedSquad(t.code);
                    return (
                      <button key={t.code} className="team-row" onClick={() => setActiveTeam(t)}>
                        <span className="flag">{t.flag}</span>
                        <span className="team-row-name">{t.name}</span>
                        <span className={`muted team-row-count ${verified ? "" : "team-pending"}`}>
                          {verified
                            ? `${squadFor(t.code).length} שחקנים · ראשוני`
                            : "סגל טרם פורסם"}
                        </span>
                        <span className="muted">→</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {activeTeam && <TeamDetail team={activeTeam} onBack={() => setActiveTeam(null)} />}
    </section>
  );
}

function TeamDetail({ team, onBack }: { team: Team; onBack: () => void }) {
  const squad = useMemo(() => squadFor(team.code), [team.code]);
  const formation = useMemo(() => pickFormation(team.code), [team.code]);
  const lineup = useMemo(() => defaultLineup(team.code, formation), [team.code, formation]);
  const verified = hasVerifiedSquad(team.code);

  const captain = squad.find(p => p.captain);
  const byPos = {
    GK:  squad.filter(p => p.position === "GK"),
    DEF: squad.filter(p => p.position === "DEF"),
    MID: squad.filter(p => p.position === "MID"),
    FWD: squad.filter(p => p.position === "FWD"),
  };

  return (
    <div className="team-detail">
      <button className="btn" onClick={onBack}>← חזרה לקבוצות</button>

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
          <strong>⚠️ הסגל הסופי טרם פורסם</strong><br/>
          <span className="muted">
            FIFA מפרסמת רשימה רשמית של 26 שחקנים לכל נבחרת כשבועיים לפני פתיחת המונדיאל (~יוני 2026).
            כדי לא להציג מידע שגוי, סגל זה יוצג רק לאחר הפרסום הרשמי.<br/>
            לחלופין, ניתן לחבר את האפליקציה ל-API-Football כדי לקבל סגלים אמיתיים בזמן אמת.
          </span>
        </div>
      )}

      {verified && (
        <div className="pred-msg is-locked" style={{ marginTop: 10, textAlign: "center" }}>
          ⚠️ סגל ראשוני בלבד · ההרכב הסופי יפורסם רשמית קרוב למונדיאל.
        </div>
      )}

      {verified && (
        <section style={{ marginTop: 18 }}>
          <h3>🏟️ הרכב פתיחה צפוי ({formation})</h3>
          <Pitch home={lineup} away={lineup} compact />
          <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>
            ההרכב מבוסס על סגל ראשוני ופורמציה ברירת מחדל; ההרכב הסופי יתעדכן רשמית כקרוב למונדיאל.
          </p>
        </section>
      )}

      {verified && (
      <section style={{ marginTop: 24 }}>
        <h3>👥 סגל ראשוני ({squad.length} שחקנים) — לא רשמי</h3>
        {(["GK","DEF","MID","FWD"] as const).map(pos => (
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
                  <div className="player-jersey">#{p.jersey}</div>
                  <div>
                    <div className="player-name">
                      {p.name} {p.captain && <span title="קפטן" style={{ color: "var(--accent)" }}>(C)</span>}
                    </div>
                    <div className="muted player-meta">
                      {p.position} · גיל {p.age} · 🏟️ {p.club}
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
