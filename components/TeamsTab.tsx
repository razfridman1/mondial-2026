"use client";
import { useMemo, useState } from "react";
import { TEAMS } from "@/lib/data";
import { teamsByGroup, squadFor, hasVerifiedSquad } from "@/lib/players";
import TeamDetail from "./TeamDetail";
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
                            : "סגל מורחב בקרוב"}
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

      {activeTeam && <TeamDetail team={activeTeam} onBack={() => setActiveTeam(null)} backLabel="← חזרה לקבוצות" />}
    </section>
  );
}
