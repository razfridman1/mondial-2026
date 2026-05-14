"use client";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { MATCHES, STAGES } from "@/lib/data";
import {
  computeGroupStandings,
  listGroupLetters,
  listKnockoutMatches,
  type TeamStanding,
  type MatchResult,
  type KnockoutMatchView,
  type ResolvedBracket,
} from "@/lib/standings";
import { resolveAllStages, stageComplete } from "@/lib/bracket";
import { applyOverride, formatIsraelDate, formatIsraelTime, matchLiveStatus } from "@/lib/utils";
import { effectiveUtc } from "@/lib/sim";
import { TEAMS } from "@/lib/data";
import type { StageId, Team } from "@/lib/types";
import MatchModal from "./MatchModal";
import TeamDetail from "./TeamDetail";

const STAGE_ORDER: StageId[] = ["GROUP", "R32", "R16", "QF", "SF", "THIRD", "FINAL"];

/* ===================================================================
 * StandingsTab — Enterprise-grade tournament standings & knockout view
 * =================================================================== */
export default function StandingsTab() {
  const overrides = useStore(s => s.overrides);
  const simConfig = useStore(s => s.simConfig);

  const [stage, setStage] = useState<StageId>("GROUP");
  const [results, setResults] = useState<Record<string, MatchResult>>({});
  const [now, setNow] = useState(Date.now());
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);
  const [openTeam, setOpenTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  /* Load match results from server */
  async function load() {
    try {
      const r = await fetch("/api/match-results");
      if (r.ok) setResults(await r.json());
    } catch {}
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const id = setInterval(load, 60000);  /* live realtime refresh */
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  /* Stage filter: count of matches per stage */
  const stageCounts = useMemo(() => {
    const out: Record<StageId, { total: number; finished: number }> = {} as any;
    for (const s of STAGE_ORDER) {
      const ms = MATCHES.filter(m => m.stage === s);
      out[s] = { total: ms.length, finished: ms.filter(m => results[m.id]).length };
    }
    return out;
  }, [results]);

  const groupLetters = useMemo(() => listGroupLetters(), []);

  /* Resolve the full bracket once whenever results change.
   * Used to display actual team names (instead of "1A", "2B") in knockout views. */
  const resolved: ResolvedBracket = useMemo(() => resolveAllStages(results), [results]);

  /* Has the previous stage finished? Used to display "stage is now unlocked" notices. */
  const stagePrereqMet = useMemo(() => {
    const PREV: Record<string, StageId | null> = {
      GROUP: null, R32: "GROUP", R16: "R32", QF: "R16", SF: "QF", THIRD: "SF", FINAL: "SF",
    };
    const out: Record<string, boolean> = {};
    STAGE_ORDER.forEach(s => {
      const prev = PREV[s];
      out[s] = !prev || stageComplete(prev, results);
    });
    return out;
  }, [results]);

  /* Detect data source — sim vs admin vs live */
  const dataSource = useMemo(() => {
    let sim = 0, live = 0, admin = 0;
    Object.values(results).forEach((r: any) => {
      if (r.source === "live") live++;
      else if (r.source === "admin" || r.setByAdmin) admin++;
      else if (r.sim) sim++;
      else admin++;
    });
    if (live > 0 && live >= sim) return "live";
    if (sim > 0) return "sim";
    if (admin > 0) return "admin";
    return "empty";
  }, [results]);

  return (
    <section className="standings">
      <h2 className="sec-title">📊 טבלאות</h2>
      <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
        טבלאות הבתים ושלבי הנוקאאוט מתעדכנות אוטומטית מתוצאות המשחקים בזמן אמת.
      </p>

      {/* Data source banner */}
      <DataSourceBanner source={dataSource} resultsCount={Object.keys(results).length} />

      {/* FIFA rules — collapsible info */}
      <FifaRulesPanel />

      {/* Stage filter */}
      <div className="stnd-stage-nav">
        {STAGE_ORDER.map(s => {
          const c = stageCounts[s];
          return (
            <button
              key={s}
              className={`stnd-stage-btn ${stage === s ? "on" : ""}`}
              onClick={() => setStage(s)}
            >
              <span>{STAGES[s].name}</span>
              <span className="stnd-stage-meta">
                {c.finished}/{c.total}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="muted" style={{ padding: 20 }}>טוען נתונים…</div>
      ) : stage === "GROUP" ? (
        <div className="stnd-groups-grid">
          {groupLetters.map(letter => (
            <GroupCard
              key={letter}
              letter={letter}
              results={results}
              now={now}
              onOpenMatch={(id) => setOpenMatchId(id)}
              onOpenTeam={(code) => { const t = TEAMS[code]; if (t) setOpenTeam(t); }}
            />
          ))}
        </div>
      ) : (
        <KnockoutView
          stage={stage}
          results={results}
          resolved={resolved}
          prereqMet={stagePrereqMet[stage]}
          onOpenMatch={(id) => setOpenMatchId(id)}
        />
      )}

      {openMatchId && (
        <MatchModal matchId={openMatchId} onClose={() => setOpenMatchId(null)} />
      )}

      {/* Team detail modal — same content as the Teams tab */}
      {openTeam && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setOpenTeam(null)}>
          <div className="modal team-detail-modal" onClick={e => e.stopPropagation()}>
            <TeamDetail
              team={openTeam}
              onBack={() => setOpenTeam(null)}
              backLabel="× סגור"
            />
          </div>
        </div>
      )}
    </section>
  );
}

/* ===================================================================
 * GroupCard — single group's standings table
 * =================================================================== */
function GroupCard({
  letter, results, now, onOpenMatch, onOpenTeam,
}: {
  letter: string;
  results: Record<string, MatchResult>;
  now: number;
  onOpenMatch: (id: string) => void;
  onOpenTeam: (teamCode: string) => void;
}) {
  const standings = useMemo(() => computeGroupStandings(letter, results), [letter, results]);

  /* Are any matches live? */
  const hasLive = useMemo(() => {
    const groupMatches = MATCHES.filter(m => m.stage === "GROUP" && m.group === letter);
    return groupMatches.some(m => matchLiveStatus(m) === "live");
  }, [letter, now]);

  return (
    <div className={`stnd-card ${hasLive ? "is-live" : ""}`}>
      <header className="stnd-card-head">
        <h3>בית {letter}</h3>
        {hasLive && <span className="stnd-live-badge">🔴 LIVE</span>}
      </header>

      <div className="stnd-table-wrap">
        <table className="stnd-table">
          <thead>
            <tr>
              <th className="stnd-th-pos">#</th>
              <th className="stnd-th-team">נבחרת</th>
              <th className="stnd-th-matches">משחקים</th>
              <th className="stnd-th-goals">שערים</th>
              <th className="stnd-th-points">נק׳</th>
            </tr>
          </thead>
          <tbody>
            {standings.map(s => (
              <StandingRow key={s.teamCode} s={s} onOpenMatch={onOpenMatch} onOpenTeam={onOpenTeam} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StandingRow({
  s, onOpenMatch, onOpenTeam,
}: {
  s: TeamStanding;
  onOpenMatch: (id: string) => void;
  onOpenTeam: (teamCode: string) => void;
}) {
  const qualClass =
    s.qualificationStatus === "qualified"   ? "qual-q"  :
    s.qualificationStatus === "third-place" ? "qual-3"  :
    s.qualificationStatus === "eliminated"  ? "qual-e"  : "qual-p";

  const movement =
    s.previousPosition && s.previousPosition !== s.position
      ? (s.previousPosition > s.position ? "up" : "down")
      : null;

  return (
    <tr className={`stnd-row ${qualClass} ${s.position === 1 ? "is-leader" : ""}`}>
      <td className="stnd-pos">
        <div className={`stnd-pos-bar ${qualClass}`} />
        <span className="stnd-pos-num">{s.position}</span>
        {movement === "up"   && <span className="stnd-arrow up" title="עלייה במיקום">▲</span>}
        {movement === "down" && <span className="stnd-arrow down" title="ירידה במיקום">▼</span>}
      </td>
      <td className="stnd-team">
        <button
          type="button"
          className="stnd-team-btn"
          onClick={() => onOpenTeam(s.teamCode)}
          title="לחץ לפרטי הקבוצה: סגל, מערך, ושחקנים"
        >
          <span className="stnd-flag">{s.teamFlag}</span>
          <span className="stnd-name">{s.teamName}</span>
        </button>
      </td>
      <td className="stnd-matches">
        <div className="stnd-chips">
          {s.matches.map(c => (
            <MatchChip key={c.matchId} c={c} onClick={() => onOpenMatch(c.matchId)} />
          ))}
        </div>
      </td>
      <td className="stnd-goals">
        <div className="stnd-goals-main">{s.goalsFor}:{s.goalsAgainst}</div>
        <div className={`stnd-goals-diff ${s.goalDifference > 0 ? "pos" : s.goalDifference < 0 ? "neg" : ""}`}>
          {s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference}
        </div>
      </td>
      <td className="stnd-points">
        <strong>{s.points}</strong>
      </td>
    </tr>
  );
}

/* ===================================================================
 * MatchChip — mini visual for a single match in a team's row
 * =================================================================== */
function MatchChip({ c, onClick }: { c: any; onClick: () => void }) {
  if (!c.finished) {
    return (
      <button
        className="stnd-chip stnd-chip-upcoming"
        onClick={onClick}
        title={`עתידי נגד ${c.opponentName}`}
      >
        <span className="stnd-chip-flag">{c.opponentFlag}</span>
        <span className="stnd-chip-result">—</span>
      </button>
    );
  }
  const cls =
    c.result === "W" ? "stnd-chip-w" :
    c.result === "D" ? "stnd-chip-d" :
                       "stnd-chip-l";
  return (
    <button
      className={`stnd-chip ${cls}`}
      onClick={onClick}
      title={`${c.result === "W" ? "ניצחון" : c.result === "D" ? "תיקו" : "הפסד"} ${c.scoreFor}:${c.scoreAgainst} נגד ${c.opponentName}`}
    >
      <span className="stnd-chip-flag">{c.opponentFlag}</span>
      <span className="stnd-chip-result">{c.scoreFor}:{c.scoreAgainst}</span>
    </button>
  );
}

/* ===================================================================
 * KnockoutView — bracket-style match cards for R32 / R16 / QF / SF / FINAL / THIRD
 * =================================================================== */
function KnockoutView({
  stage, results, resolved, prereqMet, onOpenMatch,
}: {
  stage: StageId;
  results: Record<string, MatchResult>;
  resolved: ResolvedBracket;
  prereqMet: boolean;
  onOpenMatch: (id: string) => void;
}) {
  const matches = useMemo(
    () => listKnockoutMatches(stage, results, resolved),
    [stage, results, resolved]
  );

  if (matches.length === 0) {
    return <div className="empty-state">אין משחקים בשלב הזה.</div>;
  }

  const allPlaceholder = matches.every(m => m.homeIsPlaceholder && m.awayIsPlaceholder);
  const someResolved = matches.some(m => !m.homeIsPlaceholder || !m.awayIsPlaceholder);

  return (
    <div>
      {!prereqMet && (
        <div style={{
          padding: 12, marginBottom: 14,
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.3)",
          borderRadius: 10, fontSize: 13,
        }}>
          ⏳ <strong>השלב טרם נפתח</strong> — סיים את כל המשחקים בשלב הקודם וזה השלב יתעדכן אוטומטית עם הקבוצות שעלו.
        </div>
      )}
      {prereqMet && someResolved && (
        <div style={{
          padding: 10, marginBottom: 14,
          background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.3)",
          borderRadius: 10, fontSize: 12,
        }}>
          ✓ <strong>השלב נפתח</strong> — הקבוצות נקבעו אוטומטית לפי דירוג השלב הקודם וחוקי FIFA.
        </div>
      )}

      <div className="knockout-grid">
        {matches.map(m => (
          <KnockoutMatchCard key={m.matchId} m={m} onClick={() => onOpenMatch(m.matchId)} />
        ))}
      </div>
    </div>
  );
}

function KnockoutMatchCard({
  m, onClick,
}: {
  m: KnockoutMatchView;
  onClick: () => void;
}) {
  const ph = m.homeIsPlaceholder || m.awayIsPlaceholder;
  return (
    <button
      className={`knockout-card ${ph ? "is-placeholder" : ""} ${m.finished ? "is-finished" : ""}`}
      onClick={onClick}
      title="לחץ לפרטי המשחק"
    >
      <div className="knockout-card-time">
        {formatIsraelDate(m.utc, { short: true })} · {formatIsraelTime(m.utc)}
      </div>
      <div className={`knockout-team ${m.result === "home" ? "is-winner" : ""}`}>
        <span className="knockout-flag">{m.homeFlag}</span>
        <span className="knockout-name">{m.homeName}</span>
        {m.finished && <span className="knockout-score">{m.homeScore}</span>}
      </div>
      <div className={`knockout-team ${m.result === "away" ? "is-winner" : ""}`}>
        <span className="knockout-flag">{m.awayFlag}</span>
        <span className="knockout-name">{m.awayName}</span>
        {m.finished && <span className="knockout-score">{m.awayScore}</span>}
      </div>
      {!m.finished && !ph && (
        <div className="knockout-status">⏰ עתידי</div>
      )}
      {ph && (
        <div className="knockout-status">⏳ ימולא אחרי השלב הקודם</div>
      )}
    </button>
  );
}

/* ===================================================================
 * DataSourceBanner — clarifies whether tables are showing live, sim, or admin data
 * =================================================================== */
function DataSourceBanner({ source, resultsCount }: { source: string; resultsCount: number }) {
  if (source === "empty") {
    return (
      <div style={{
        padding: 12,
        background: "rgba(245,158,11,0.10)",
        border: "1px solid rgba(245,158,11,0.4)",
        borderRadius: 10,
        fontSize: 13, lineHeight: 1.7, marginBottom: 12,
      }}>
        ⏳ <strong>אין עדיין תוצאות.</strong> הטבלאות יתעדכנו אוטומטית ברגע שיוזנו תוצאות —
        ידנית דרך 🛡️ ניהול תוצאות, או אוטומטית מ‑API חיצוני (כשהמונדיאל יתחיל).
      </div>
    );
  }
  if (source === "live") {
    return (
      <div style={{
        padding: 12,
        background: "rgba(34,197,94,0.10)",
        border: "1px solid rgba(34,197,94,0.5)",
        borderRadius: 10,
        fontSize: 13, lineHeight: 1.7, marginBottom: 12,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{
          background: "#22c55e", color: "#fff",
          padding: "2px 8px", borderRadius: 6,
          fontSize: 11, fontWeight: 800,
          animation: "stnd-pulse 1.5s infinite",
        }}>🔴 LIVE</span>
        <span>
          התוצאות נמשכות אוטומטית מ‑API חיצוני בזמן אמת ({resultsCount} משחקים בטבלה).
        </span>
      </div>
    );
  }
  if (source === "sim") {
    return (
      <div style={{
        padding: 12,
        background: "rgba(167,139,250,0.10)",
        border: "1px solid rgba(167,139,250,0.5)",
        borderRadius: 10,
        fontSize: 13, lineHeight: 1.7, marginBottom: 12,
      }}>
        🧪 <strong>מצב סימולציה</strong> — {resultsCount} תוצאות אקראיות/משוקללות נוצרו לבדיקה.
        כשהמונדיאל יתחיל באמת (11.6.2026): לחץ "🔄 אפס סימולציה" בלשונית 🧪 ניהול סימולציה,
        ואז התוצאות האמיתיות ימשכו אוטומטית.
      </div>
    );
  }
  /* admin / mixed */
  return (
    <div style={{
      padding: 10,
      background: "rgba(0,212,255,0.08)",
      border: "1px solid var(--accent)",
      borderRadius: 10,
      fontSize: 12, lineHeight: 1.6, marginBottom: 12,
    }}>
      ✓ <strong>תוצאות מאומתות</strong> — {resultsCount} תוצאות הוזנו ידנית או נמשכו מ‑live API.
      הטבלאות מתעדכנות אוטומטית.
    </div>
  );
}

/* ===================================================================
 * FifaRulesPanel — collapsible explanation of FIFA 2026 advancement rules
 * =================================================================== */
function FifaRulesPanel() {
  return (
    <details className="fifa-rules">
      <summary>
        <span>ℹ️ חוקיות העפלה — FIFA Mondial 2026</span>
        <span className="muted" style={{ fontSize: 11, marginInlineStart: 8 }}>
          לחץ לפתיחה
        </span>
      </summary>

      <div className="fifa-rules-body">
        {/* Format */}
        <h4>🏆 פורמט הטורניר (48 קבוצות)</h4>
        <ul>
          <li><strong>שלב הבתים:</strong> 12 בתים של 4 קבוצות. כל קבוצה משחקת 3 משחקים.</li>
          <li><strong>32 האחרונות:</strong> 32 קבוצות עולות בסך הכל —
            <ul>
              <li>🥇 <strong>המקום הראשון</strong> בכל בית (×12 = 12 קבוצות)</li>
              <li>🥈 <strong>המקום השני</strong> בכל בית (×12 = 12 קבוצות)</li>
              <li>🥉 <strong>8 המקומות השלישיים הטובים ביותר</strong> מבין 12 הבתים (×8 = 8 קבוצות)</li>
            </ul>
          </li>
          <li><strong>נוקאאוט:</strong> 32 → 16 → 8 (רבע) → 4 (חצי) → גמר. בנוסף משחק על המקום ה‑3.</li>
        </ul>

        {/* Tiebreakers */}
        <h4>⚖️ סדר ה‑Tiebreakers (במקרה של שוויון נקודות)</h4>
        <ol>
          <li><strong>נקודות</strong> — 3 לניצחון, 1 לתיקו, 0 להפסד.</li>
          <li><strong>הפרש שערים</strong> — שערי זכות פחות שערי חובה.</li>
          <li><strong>שערי זכות</strong> — סך השערים שהקבוצה הבקיעה.</li>
          <li><strong>תוצאות פנים‑מול‑פנים</strong> בין הקבוצות השוות — נקודות, ואז הפרש שערים בהתמודדויות הישירות, ואז שערים בהתמודדויות.</li>
          <li><strong>Fair Play</strong> — קבוצה עם פחות צהובים/אדומים. (לא מנוטר באפליקציה כעת.)</li>
          <li><strong>הגרלה</strong> — אם כל השאר זהה, הפיפ"א מגרילה. (אנו משתמשים בסדר אלפבית כברירת מחדל לתצוגה.)</li>
        </ol>

        {/* 3rd-place mechanics */}
        <h4>🥉 איך בוחרים את 8 המקומות השלישיים הטובים?</h4>
        <p style={{ margin: "4px 0 6px" }}>
          לאחר סיום שלב הבתים, כל 12 השלישיים מסודרים יחד באותו סדר tiebreakers (נקודות → הפרש → זכות → ...).
          8 המובילים מהם עולים לשלב 32 האחרונות. 4 השלישיים האחרונים מסיימים את הטורניר.
        </p>

        {/* Color legend */}
        <h4>🎨 מקרא צבעי עמודת המקום</h4>
        <div className="fifa-legend">
          <div><span className="fifa-leg-bar qual-q" /> <strong>ירוק</strong> — עולה ישירות (מקום 1-2)</div>
          <div><span className="fifa-leg-bar qual-3" /> <strong>כתום</strong> — שלישית, מועמדת ל‑8 שלישיים הטובים</div>
          <div><span className="fifa-leg-bar qual-e" /> <strong>אדום</strong> — מסיימת את הטורניר (מקום 4)</div>
          <div><span className="fifa-leg-bar qual-p" /> <strong>אפור</strong> — עוד לא הסתיים (הבית בעיצומו)</div>
        </div>

        {/* Knockout */}
        <h4>⚽ נוקאאוט — כללים בקצרה</h4>
        <ul>
          <li>אם תיקו אחרי 90 דקות — <strong>הארכה</strong> של 2×15 דקות.</li>
          <li>אם עדיין תיקו — <strong>פנדלים</strong>. הזוכה בדו‑קרב מעפיל.</li>
          <li>אין שלב נוסף — מהפסד = יציאה מהטורניר.</li>
        </ul>

        <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
          📚 בהתאם לתקנון פיפ"א הרשמי למונדיאל 2026.
        </p>
      </div>
    </details>
  );
}
