"use client";
/* =====================================================================
 * SimulationPanel — stage-by-stage testing workflow.
 *
 * Per stage:
 *   1) Fill random PREDICTIONS for all members of the selected group.
 *   2) Once predictions exist, fill random RESULTS for that stage.
 *   3) Next stage unlocks only when current stage's results are complete.
 *
 * Side table shows progress per stage.
 * Reset button wipes ALL simulation data so the real World Cup can start.
 * ===================================================================*/
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";
import { MATCHES } from "@/lib/data";
import type { StageId } from "@/lib/types";

interface GroupRow { id: string; name: string; memberCount?: number; }
interface StageStatus {
  stage: StageId;
  matchesTotal: number;
  resultsFilled: number;
  predictionsFilled: number;
  predictionsTotal: number;
}

const STAGE_ORDER: StageId[] = ["GROUP", "R32", "R16", "QF", "SF", "THIRD", "FINAL"];
const STAGE_NAMES: Record<StageId, string> = {
  GROUP: "שלב הבתים",
  R32:   "32 אחרונות",
  R16:   "שמינית גמר",
  QF:    "רבע גמר",
  SF:    "חצי גמר",
  THIRD: "משחק על המקום השלישי",
  FINAL: "הגמר",
};
const STAGE_EMOJI: Record<StageId, string> = {
  GROUP: "🏟", R32: "🎯", R16: "🥊", QF: "🏆", SF: "⚔", THIRD: "🥉", FINAL: "👑",
};

/* Compute matches per stage for total reference. */
const STAGE_MATCH_COUNT: Record<StageId, number> = STAGE_ORDER.reduce((acc, s) => {
  acc[s] = MATCHES.filter(m => m.stage === s).length;
  return acc;
}, {} as Record<StageId, number>);

export default function SimulationPanel() {
  const user = useStore(s => s.user);

  const [groups, setGroups]     = useState<GroupRow[]>([]);
  const [groupId, setGroupId]   = useState<string>("");
  const [statuses, setStatuses] = useState<StageStatus[]>([]);
  const [busy, setBusy]         = useState(false);

  async function authHeaders() {
    const token = await getFirebase().auth!.currentUser!.getIdToken();
    return { "content-type": "application/json", authorization: `Bearer ${token}` };
  }

  /* Load admin's group list (target for prediction fills). */
  async function reloadGroups() {
    if (!user?.isAdmin) return;
    try {
      const r = await fetch("/api/admin/groups", { headers: await authHeaders() });
      if (r.ok) {
        const data = await r.json();
        setGroups(data);
        if (!groupId && data[0]) setGroupId(data[0].id);
      }
    } catch {}
  }
  useEffect(() => { reloadGroups(); }, [user?.isAdmin]);

  /* Re-fetch stage statuses whenever the chosen group changes or after actions. */
  async function reloadStatus() {
    if (!groupId) { setStatuses([]); return; }
    try {
      const r = await fetch(`/api/admin/sim/status?groupId=${encodeURIComponent(groupId)}`,
                            { headers: await authHeaders() });
      if (r.ok) {
        const data = await r.json();
        setStatuses(data.stages || []);
      }
    } catch {}
  }
  useEffect(() => { reloadStatus(); }, [groupId]);

  /* Derived gating logic per stage. */
  const stageState = useMemo(() => {
    const map: Record<StageId, {
      predictionsDone: boolean;
      resultsDone: boolean;
      canFillPredictions: boolean;
      canFillResults: boolean;
      stageStatus: StageStatus | undefined;
    }> = {} as any;

    /* helper: previous stage in ORDER */
    function prevStage(s: StageId): StageId | null {
      const i = STAGE_ORDER.indexOf(s);
      return i > 0 ? STAGE_ORDER[i - 1] : null;
    }

    for (const s of STAGE_ORDER) {
      const st = statuses.find(x => x.stage === s);
      const matchesTotal = STAGE_MATCH_COUNT[s];
      const predictionsDone = !!st && st.predictionsFilled >= st.predictionsTotal && st.predictionsTotal > 0;
      const resultsDone     = !!st && st.resultsFilled >= matchesTotal && matchesTotal > 0;
      map[s] = {
        predictionsDone, resultsDone,
        canFillPredictions: false,
        canFillResults: false,
        stageStatus: st,
      };
    }
    /* gating: depends on previous stage */
    for (const s of STAGE_ORDER) {
      const prev = prevStage(s);
      const prevResultsDone = prev ? map[prev].resultsDone : true; // GROUP has no prev
      map[s].canFillPredictions = prevResultsDone && !map[s].resultsDone;
      map[s].canFillResults     = prevResultsDone && map[s].predictionsDone && !map[s].resultsDone;
    }
    return map;
  }, [statuses]);

  async function fillPredictionsForStage(stage: StageId) {
    if (!groupId) { alert("בחר קבוצה."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/sim/random-fill", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ groupId, stage, includePlaceholders: stage !== "GROUP" }),
      });
      const data = await r.json();
      if (!r.ok) { alert(`שגיאה: ${data.error || r.status}`); return; }
    } finally {
      setBusy(false);
      await reloadStatus();
    }
  }

  async function fillResultsForStage(stage: StageId) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/sim/instant-results", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ stage, overwrite: true }),
      });
      const data = await r.json();
      if (!r.ok) { alert(`שגיאה: ${data.message || data.error || r.status}`); return; }
    } finally {
      setBusy(false);
      await reloadStatus();
    }
  }

  async function fullReset() {
    if (!confirm(
      "🏁 איפוס מלא לפני המונדיאל האמיתי\n\n" +
      "פעולה זו תמחק:\n" +
      "• כל הניחושים (כולל אוטומטיים שנוצרו בסים)\n" +
      "• כל תוצאות הסים (תוצאות אמת לא נמחקות)\n" +
      "• broadcast overrides\n" +
      "• פיד הפעילות\n" +
      "• מבטל סים זמן\n\n" +
      "משתמשים, קבוצות, חברויות ופרופילים — יישמרו.\n\n" +
      "המערכת תהיה נקייה לקראת המונדיאל. להמשיך?"
    )) return;
    if (!confirm("פעולה בלתי הפיכה. לאשר סופית?")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/sim/full-reset", {
        method: "POST",
        headers: await authHeaders(),
      });
      const data = await r.json();
      if (!r.ok) { alert(`שגיאה: ${data.error || r.status}`); return; }
      const c = data.counts;
      alert(
        `✓ איפוס הושלם — המערכת מוכנה למונדיאל האמיתי\n\n` +
        `ניחושים שנמחקו: ${c.predictions}\n` +
        `תוצאות סים שנמחקו: ${c.results}\n` +
        `Overrides: ${c.overrides}\n` +
        `פעילות: ${c.activity}`
      );
    } finally {
      setBusy(false);
      await reloadStatus();
    }
  }

  /* ---- guards ---- */
  if (!user) return (
    <div className="admin-locked">
      <h3>🔒 ניהול סימולציה</h3>
      <p className="muted">צריך להתחבר כדי לגשת לפאנל הסימולציה.</p>
    </div>
  );
  if (!user.isAdmin) return (
    <div className="admin-locked">
      <h3>🔒 ניהול סימולציה — מנהל בלבד</h3>
      <p className="muted">אין לך הרשאת אדמין.</p>
    </div>
  );

  return (
    <section className="sim-panel">
      <div className="admin-bar">
        <h3>🧪 סימולציה — בדיקת המערכת לפני המונדיאל</h3>
      </div>

      <p className="muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>
        מילוי מדורג של ניחושים ותוצאות שלב-אחר-שלב כדי לבדוק את כל הזרימה (טבלאות, ברקט,
        leaderboard) לפני שהמונדיאל האמיתי מתחיל. כל לחיצה — מיידית.
      </p>

      {/* Group picker */}
      <div className="sim-group-picker">
        <label htmlFor="sim-group" style={{ fontWeight: 700, marginInlineEnd: 8 }}>
          👥 קבוצה למילוי ניחושים:
        </label>
        <select id="sim-group" value={groupId} onChange={e => setGroupId(e.target.value)}>
          <option value="">— בחר קבוצה —</option>
          {groups.map(g => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.memberCount || 0} חברים)
            </option>
          ))}
        </select>
      </div>

      {/* Two-column layout: workflow on the right, status table on the left (in RTL "side") */}
      <div className="sim-workflow-grid">
        {/* Stage workflow */}
        <div className="sim-workflow">
          {STAGE_ORDER.map(s => {
            const state = stageState[s];
            const st = state.stageStatus;
            const matches = STAGE_MATCH_COUNT[s];
            const predFill = st ? `${st.predictionsFilled}/${st.predictionsTotal}` : "—";
            const resFill  = st ? `${st.resultsFilled}/${matches}` : `0/${matches}`;
            const prev = STAGE_ORDER.indexOf(s) > 0 ? STAGE_ORDER[STAGE_ORDER.indexOf(s) - 1] : null;
            const prevResultsDone = prev ? stageState[prev].resultsDone : true;
            const stageLocked = !prevResultsDone;

            return (
              <div key={s} className={`sim-stage-card ${stageLocked ? "is-locked" : ""}`}>
                <header className="sim-stage-head">
                  <span style={{ fontSize: 22 }}>{STAGE_EMOJI[s]}</span>
                  <span className="sim-stage-title">{STAGE_NAMES[s]}</span>
                  {state.resultsDone && <span className="sim-badge sim-badge-done">✓ הושלם</span>}
                  {stageLocked && <span className="sim-badge sim-badge-locked">🔒 נעול</span>}
                </header>

                {stageLocked ? (
                  <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
                    יתפתח אחרי שתשלים את תוצאות "{STAGE_NAMES[prev!]}"
                  </p>
                ) : (
                  <>
                    <div className="sim-step">
                      <div className="sim-step-info">
                        <span>🎲 ניחושים של חברי הקבוצה</span>
                        <span className="muted">{predFill}</span>
                      </div>
                      <button
                        className={`btn btn-small ${state.predictionsDone ? "" : "btn-primary"}`}
                        disabled={busy || !state.canFillPredictions || !groupId}
                        onClick={() => fillPredictionsForStage(s)}
                      >
                        {state.predictionsDone ? "🔄 מילוי מחדש" : "🎲 מלא ניחושים"}
                      </button>
                    </div>

                    <div className="sim-step">
                      <div className="sim-step-info">
                        <span>⚽ תוצאות משחקים</span>
                        <span className="muted">{resFill}</span>
                      </div>
                      <button
                        className={`btn btn-small ${state.resultsDone ? "" : "btn-primary"}`}
                        disabled={busy || !state.canFillResults}
                        onClick={() => fillResultsForStage(s)}
                        title={!state.predictionsDone ? "קודם מלא ניחושים" : ""}
                      >
                        {state.resultsDone ? "🔄 מילוי מחדש" : "⚽ מלא תוצאות"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Status table */}
        <aside className="sim-status-table">
          <h4 style={{ marginTop: 0, marginBottom: 10 }}>📊 סטטוס סימולציה</h4>
          <table>
            <thead>
              <tr>
                <th>שלב</th>
                <th>ניחושים</th>
                <th>תוצאות</th>
              </tr>
            </thead>
            <tbody>
              {STAGE_ORDER.map(s => {
                const state = stageState[s];
                const st = state.stageStatus;
                const matches = STAGE_MATCH_COUNT[s];
                const predIcon = state.predictionsDone ? "🟢" :
                                 (st && st.predictionsFilled > 0) ? "🟡" : "⚪";
                const resIcon = state.resultsDone ? "🟢" :
                                (st && st.resultsFilled > 0) ? "🟡" : "⚪";
                return (
                  <tr key={s}>
                    <td><span style={{ marginInlineEnd: 4 }}>{STAGE_EMOJI[s]}</span>{STAGE_NAMES[s]}</td>
                    <td>{predIcon} {st?.predictionsFilled ?? 0}/{st?.predictionsTotal ?? 0}</td>
                    <td>{resIcon} {st?.resultsFilled ?? 0}/{matches}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </aside>
      </div>

      {/* Reset section */}
      <div className="sim-reset">
        <div>
          <h4 style={{ margin: 0, color: "var(--red)" }}>🏁 סיימת לבדוק? נקה הכל לקראת המונדיאל</h4>
          <p className="muted" style={{ fontSize: 12, margin: "4px 0 0", lineHeight: 1.55 }}>
            מוחק את כל הניחושים, תוצאות סים, broadcast overrides, פיד פעילות, ומכבה את הסים.
            <br /><strong>משתמשים, קבוצות ופרופילים נשמרים.</strong> תוצאות אמת ידניות נשמרות.
          </p>
        </div>
        <button
          className="btn sim-reset-btn"
          disabled={busy}
          onClick={fullReset}>
          🏁 איפוס כל נתוני הסימולציה
        </button>
      </div>
    </section>
  );
}
