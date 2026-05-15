"use client";
/* =====================================================================
 * SimulationPanel (renamed in nav → "ניהול ניחושים")
 *
 * Post-simulation admin tab. Lets the admin:
 *   • Fill random PREDICTIONS for all members of a chosen group (per stage)
 *     — useful when seeding test data or for groups that ask to be auto-
 *     predicted before deadlines.
 *   • Clear all predictions for one group in one click.
 *   • Full reset of all sim artifacts (predictions, broadcast overrides,
 *     activity, sim-flagged results) — preserves users, groups, profiles,
 *     and real results from the live football-data.org sync.
 *
 * Results management was removed — real results now flow in from
 * football-data.org via the /api/cron/sync-results cron.
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

  /* Derived state: which stages have predictions filled (predictionsDone). */
  const stageState = useMemo(() => {
    const map: Record<StageId, { predictionsDone: boolean; stageStatus: StageStatus | undefined }> = {} as any;
    for (const s of STAGE_ORDER) {
      const st = statuses.find(x => x.stage === s);
      const predictionsDone = !!st && st.predictionsFilled > 0;
      map[s] = { predictionsDone, stageStatus: st };
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
      if (!r.ok) {
        alert(`שגיאה במילוי ניחושים: ${data.error || r.status}`);
        return;
      }
      const filled = data.filled ?? 0;
      const stageName = STAGE_NAMES[stage];
      if (filled === 0) {
        alert(`⚠ לא מולאו ניחושים ב-"${stageName}".\n${data.reason || "ייתכן שאין חברים בקבוצה או שאין משחקים זמינים."}`);
      } else {
        console.log(`[sim] predictions filled: ${filled} for stage ${stage}`);
      }
    } catch (e: any) {
      alert(`שגיאה: ${e?.message || e}`);
    } finally {
      setBusy(false);
      await reloadStatus();
    }
  }

  async function clearStagePredictions(stage: StageId) {
    if (!confirm(
      `למחוק את הניחושים בשלב "${STAGE_NAMES[stage]}" לחברי הקבוצה הנבחרת?\n\n` +
      `פעולה זו לא נוגעת בתוצאות אמת ולא במשתמשים/קבוצות.`
    )) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/sim/clear-stage", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ stage, groupId: groupId || undefined }),
      });
      const data = await r.json();
      if (!r.ok) {
        alert(`שגיאה: ${data.error || r.status}`);
        return;
      }
      console.log(`[sim] cleared predictions in stage ${stage}:`, data);
    } catch (e: any) {
      alert(`שגיאה: ${e?.message || e}`);
    } finally {
      setBusy(false);
      await reloadStatus();
    }
  }

  /* NEW: one-click wipe of all predictions for the chosen group, across ALL stages. */
  async function clearAllGroupPredictions() {
    if (!groupId) { alert("בחר קבוצה."); return; }
    const grp = groups.find(g => g.id === groupId);
    if (!confirm(
      `למחוק את כל הניחושים של הקבוצה "${grp?.name || groupId}"?\n\n` +
      `יימחקו ניחושים בכל השלבים (שלב הבתים, 32, שמינית, רבע, חצי, גמר ועל המקום השלישי).\n` +
      `פעולה זו לא נוגעת בתוצאות אמת, במשתמשים או בקבוצות.`
    )) return;
    if (!confirm("פעולה בלתי הפיכה. לאשר?")) return;
    setBusy(true);
    let total = 0;
    let failed: string[] = [];
    try {
      for (const stage of STAGE_ORDER) {
        const r = await fetch("/api/admin/sim/clear-stage", {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ stage, groupId }),
        });
        const data = await r.json();
        if (r.ok) total += data.deletedPredictions || 0;
        else failed.push(STAGE_NAMES[stage]);
      }
      if (failed.length) {
        alert(`נמחקו ${total} ניחושים, אך נכשל בשלבים: ${failed.join(", ")}`);
      } else {
        alert(`✓ נמחקו ${total} ניחושים בסה"כ עבור הקבוצה.`);
      }
    } catch (e: any) {
      alert(`שגיאה: ${e?.message || e}`);
    } finally {
      setBusy(false);
      await reloadStatus();
    }
  }

  async function fullReset() {
    if (!confirm(
      "🏁 איפוס מלא לקראת המונדיאל האמיתי\n\n" +
      "פעולה זו תמחק:\n" +
      "• כל הניחושים\n" +
      "• broadcast overrides\n" +
      "• פיד הפעילות\n" +
      "• תוצאות-סים בלבד (אם נשארו)\n" +
      "• מבטל את הסים\n\n" +
      "✓ נשמרים: משתמשים, קבוצות, חברויות, פרופילים, תוצאות אמת.\n\n" +
      "להמשיך?"
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
      <h3>🔒 ניהול ניחושים</h3>
      <p className="muted">צריך להתחבר כדי לגשת לפאנל.</p>
    </div>
  );
  if (!user.isAdmin) return (
    <div className="admin-locked">
      <h3>🔒 ניהול ניחושים — מנהל בלבד</h3>
      <p className="muted">אין לך הרשאת אדמין.</p>
    </div>
  );

  return (
    <section className="sim-panel">
      <div className="admin-bar">
        <h3>🎲 ניהול ניחושים</h3>
      </div>

      <p className="muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>
        מילוי אוטומטי של ניחושים לחברי קבוצה ומחיקתם בלחיצה אחת.
        תוצאות אמיתיות מגיעות אוטומטית מ-FIFA דרך ה-API החי, ולא מנוהלות כאן.
      </p>

      {/* Group picker + group-wide clear */}
      <div className="sim-group-picker" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <label htmlFor="sim-group" style={{ fontWeight: 700 }}>
          👥 קבוצה:
        </label>
        <select id="sim-group" value={groupId} onChange={e => setGroupId(e.target.value)}>
          <option value="">— בחר קבוצה —</option>
          {groups.map(g => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.memberCount || 0} חברים)
            </option>
          ))}
        </select>
        <button
          className="btn btn-small btn-danger"
          disabled={busy || !groupId}
          onClick={clearAllGroupPredictions}
          title="מחיקת כל הניחושים בכל השלבים לחברי הקבוצה הנבחרת"
        >
          🧹 מחק את כל הניחושים של הקבוצה
        </button>
      </div>

      {/* Two-column layout: workflow on the right, status table on the left (in RTL "side") */}
      <div className="sim-workflow-grid">
        {/* Stage workflow — predictions only */}
        <div className="sim-workflow">
          {STAGE_ORDER.map(s => {
            const state = stageState[s];
            const st = state.stageStatus;
            const predFill = st ? `${st.predictionsFilled}/${st.predictionsTotal}` : "—";

            return (
              <div key={s} className="sim-stage-card">
                <header className="sim-stage-head">
                  <span style={{ fontSize: 22 }}>{STAGE_EMOJI[s]}</span>
                  <span className="sim-stage-title">{STAGE_NAMES[s]}</span>
                  {state.predictionsDone && <span className="sim-badge sim-badge-done">✓ יש ניחושים</span>}
                </header>

                <div className="sim-step">
                  <div className="sim-step-info">
                    <span>🎲 ניחושים של חברי הקבוצה</span>
                    <span className="muted">{predFill}</span>
                  </div>
                  <button
                    className={`btn btn-small ${state.predictionsDone ? "" : "btn-primary"}`}
                    disabled={busy || !groupId}
                    onClick={() => fillPredictionsForStage(s)}
                  >
                    {state.predictionsDone ? "🔄 מילוי מחדש" : "🎲 מלא ניחושים"}
                  </button>
                </div>

                {/* Per-stage clear — predictions only */}
                {st && st.predictionsFilled > 0 && (
                  <div className="sim-step sim-step-reset">
                    <div className="sim-step-info">
                      <span style={{ color: "var(--red)" }}>🧹 מחק ניחושים בשלב</span>
                      <span className="muted" style={{ fontSize: 11 }}>
                        לחברי הקבוצה הנבחרת בלבד
                      </span>
                    </div>
                    <button
                      className="btn btn-small"
                      style={{
                        background: "rgba(239,68,68,0.12)",
                        borderColor: "var(--red)",
                        color: "var(--red)",
                      }}
                      disabled={busy}
                      onClick={() => clearStagePredictions(s)}
                    >
                      🧹 מחק שלב
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Status table — predictions only */}
        <aside className="sim-status-table">
          <h4 style={{ marginTop: 0, marginBottom: 10 }}>📊 סטטוס ניחושים</h4>
          <table>
            <thead>
              <tr>
                <th>שלב</th>
                <th>ניחושים</th>
              </tr>
            </thead>
            <tbody>
              {STAGE_ORDER.map(s => {
                const state = stageState[s];
                const st = state.stageStatus;
                const predIcon = state.predictionsDone ? "🟢" :
                                 (st && st.predictionsFilled > 0) ? "🟡" : "⚪";
                return (
                  <tr key={s}>
                    <td><span style={{ marginInlineEnd: 4 }}>{STAGE_EMOJI[s]}</span>{STAGE_NAMES[s]}</td>
                    <td>{predIcon} {st?.predictionsFilled ?? 0}/{st?.predictionsTotal ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </aside>
      </div>

      {/* Full reset section */}
      <div className="sim-reset">
        <div>
          <h4 style={{ margin: 0, color: "var(--red)" }}>🏁 איפוס מלא לקראת המונדיאל</h4>
          <p className="muted" style={{ fontSize: 12, margin: "4px 0 0", lineHeight: 1.55 }}>
            מוחק את כל הניחושים, תוצאות-סים שנשארו, broadcast overrides, ופיד הפעילות.
            <br /><strong>משתמשים, קבוצות, פרופילים ותוצאות אמת — נשמרים.</strong>
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
