"use client";
/* =====================================================================
 * TeamDossier — full single-team profile for the "הנבחרות שלי" tab.
 * Shows: coach, squad by position, expected lineup per upcoming match,
 * results so far, and current tournament status. Reused both for tracked
 * teams and for the (non-saved) search lookup.
 * ===================================================================*/
import { useMemo, useState } from "react";
import { STAGES } from "@/lib/data";
import { squadFor, hasVerifiedSquad, coachFor } from "@/lib/players";
import { buildMatchLineups, defaultLineup, pickFormation } from "@/lib/lineups";
import { teamMatches, teamStatus, type TeamStatusKind } from "@/lib/team-dossier";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";
import type { MatchResult, ResolvedBracket } from "@/lib/standings";
import type { Team } from "@/lib/types";
import Pitch from "./Pitch";

const STATUS_TONE: Record<TeamStatusKind, string> = {
  pending:    "dossier-status-pending",
  group:      "dossier-status-group",
  active:     "dossier-status-active",
  eliminated: "dossier-status-out",
  third:      "dossier-status-active",
  fourth:     "dossier-status-group",
  runnerup:   "dossier-status-active",
  champion:   "dossier-status-champ",
};

export default function TeamDossier({
  team, results, resolved, headerAction,
}: {
  team: Team;
  results: Record<string, MatchResult>;
  resolved: ResolvedBracket;
  headerAction?: React.ReactNode;
}) {
  const squad     = useMemo(() => squadFor(team.code), [team.code]);
  const verified  = hasVerifiedSquad(team.code);
  const coach     = coachFor(team.code);
  const formation = useMemo(() => pickFormation(team.code), [team.code]);

  const allMatches = useMemo(
    () => teamMatches(team.code, results, resolved),
    [team.code, results, resolved]
  );
  const status = useMemo(
    () => teamStatus(team.code, results, resolved),
    [team.code, results, resolved]
  );

  const finished = allMatches.filter(m => m.finished);
  const upcoming = allMatches.filter(m => !m.finished);

  const byPos = {
    GK:  squad.filter(p => p.position === "GK"),
    DEF: squad.filter(p => p.position === "DEF"),
    MID: squad.filter(p => p.position === "MID"),
    FWD: squad.filter(p => p.position === "FWD"),
  };

  return (
    <div className="dossier">
      {/* ---------- Header ---------- */}
      <header className="dossier-head">
        <span className="dossier-flag">{team.flag}</span>
        <div className="dossier-head-main">
          <h3 className="dossier-name">{team.name}</h3>
          <div className="muted dossier-sub">
            בית {team.group} · {team.nameEn}
          </div>
          <div className={`dossier-status ${STATUS_TONE[status.kind]}`}>
            {status.label}{status.detail ? ` · ${status.detail}` : ""}
          </div>
        </div>
        {headerAction && <div className="dossier-head-action">{headerAction}</div>}
      </header>

      {/* ---------- Coach ---------- */}
      <div className="dossier-coach">
        <span className="dossier-coach-label">👔 מאמן</span>
        {coach ? (
          <span className="dossier-coach-name">
            {coach.flag} {coach.name} <span className="muted">· {coach.nameEn}</span>
          </span>
        ) : (
          <span className="muted">טרם פורסם</span>
        )}
      </div>

      {/* ---------- Results so far ---------- */}
      <section className="dossier-block">
        <h4 className="dossier-block-title">📋 התוצאות עד כה</h4>
        {finished.length === 0 ? (
          <div className="muted dossier-empty">עוד לא שיחקה משחקים במונדיאל.</div>
        ) : (
          <div className="dossier-results">
            {finished.map(m => (
              <div key={m.matchId} className={`dossier-result res-${m.result}`}>
                <span className="dossier-result-stage">
                  {STAGES[m.stage].name}{m.group ? ` · בית ${m.group}` : ""}
                </span>
                <span className="dossier-result-mid">
                  <span className="dossier-result-badge">{m.result}</span>
                  <strong className="dossier-result-score">{m.scoreFor}:{m.scoreAgainst}</strong>
                  <span className="muted">נגד</span>
                  <span>{m.opponentFlag} {m.opponentName}</span>
                </span>
                <span className="muted dossier-result-date">
                  {formatIsraelDate(m.utc, { short: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Upcoming matches + expected lineups ---------- */}
      <section className="dossier-block">
        <h4 className="dossier-block-title">🏟️ הרכבים לפני כל משחק</h4>
        {upcoming.length === 0 ? (
          <div className="muted dossier-empty">
            אין משחקים עתידיים ידועים כרגע {status.kind === "eliminated" ? "(הנבחרת סיימה את דרכה)" : ""}.
          </div>
        ) : (
          <div className="dossier-upcoming">
            {upcoming.map(m => (
              <UpcomingLineup
                key={m.matchId}
                teamCode={team.code}
                opponentCode={m.opponentResolved ? m.opponentCode : null}
                opponentName={m.opponentName}
                opponentFlag={m.opponentFlag}
                stageLabel={STAGES[m.stage].name + (m.group ? ` · בית ${m.group}` : "")}
                utc={m.utc}
                isHome={m.isHome}
              />
            ))}
          </div>
        )}
        {verified && (
          <p className="muted dossier-note">
            ⚠️ ההרכב מבוסס על סגל ראשוני ופורמציה משוערת ({formation}); ההרכב הסופי יתעדכן סמוך למשחק.
          </p>
        )}
      </section>

      {/* ---------- Squad by position ---------- */}
      <section className="dossier-block">
        <h4 className="dossier-block-title">👥 כל השחקנים לפי מיקומים</h4>
        {!verified ? (
          <div className="muted dossier-empty">
            עדיין לא הוזן במערכת סגל מפורט עבור נבחרת זו. הנתונים יתעדכנו בקרוב.
          </div>
        ) : (
          <div className="dossier-squad">
            {(["GK", "DEF", "MID", "FWD"] as const).map(pos => (
              <div key={pos} className="dossier-pos-block">
                <h5 className="dossier-pos-title">
                  {pos === "GK"  && "🧤 שוערים"}
                  {pos === "DEF" && "🛡️ הגנה"}
                  {pos === "MID" && "⚙️ קישור"}
                  {pos === "FWD" && "🎯 התקפה"}
                  <span className="muted"> · {byPos[pos].length}</span>
                </h5>
                <div className="dossier-pos-grid">
                  {byPos[pos].map(p => (
                    <div key={p.id} className="dossier-player">
                      <span className="dossier-player-jersey">#{p.jersey}</span>
                      <span className="dossier-player-name">
                        {p.name}
                        {p.captain && <span title="קפטן" className="dossier-cap"> (C)</span>}
                      </span>
                      <span className="muted dossier-player-club">🏟️ {p.club} · גיל {p.age}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* Per-match expandable expected lineup. Renders both teams on the pitch
 * (home/away orientation preserved). */
function UpcomingLineup({
  teamCode, opponentCode, opponentName, opponentFlag, stageLabel, utc, isHome,
}: {
  teamCode: string;
  opponentCode: string | null;
  opponentName: string;
  opponentFlag: string;
  stageLabel: string;
  utc: string;
  isHome: boolean;
}) {
  const [open, setOpen] = useState(false);
  const lineups = useMemo(() => {
    if (!opponentCode) {
      const self = defaultLineup(teamCode, pickFormation(teamCode));
      return { home: self, away: self, soloOnly: true };
    }
    const homeCode = isHome ? teamCode : opponentCode;
    const awayCode = isHome ? opponentCode : teamCode;
    return { ...buildMatchLineups(homeCode, awayCode), soloOnly: false };
  }, [teamCode, opponentCode, isHome]);

  return (
    <div className="dossier-upcoming-item">
      <button className="dossier-upcoming-head" onClick={() => setOpen(o => !o)}>
        <span className="dossier-upcoming-caret">{open ? "▾" : "▸"}</span>
        <span className="dossier-upcoming-stage">{stageLabel}</span>
        <span className="dossier-upcoming-opp">
          נגד {opponentFlag} {opponentName}
        </span>
        <span className="muted dossier-upcoming-date">
          {formatIsraelDate(utc, { short: true })} · {formatIsraelTime(utc)}
        </span>
      </button>
      {open && (
        <div className="dossier-upcoming-body">
          <Pitch home={lineups.home} away={lineups.away} compact />
          {lineups.soloOnly && (
            <p className="muted dossier-note">
              היריבה תיקבע בתום השלב הקודם — מוצג הרכב הפתיחה המשוער של {teamCode}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
