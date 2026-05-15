"use client";
/* =====================================================================
 * SimulationPanel (nav label → "ניהול ניחושים")
 *
 * Admin-only tab. Single purpose: reset predictions per stage for a
 * chosen group. No data fabrication, no full-system resets.
 *
 * Real match results flow in from football-data.org via the
 * /api/cron/sync-results cron — not managed here.
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

  const statusByStage = useMemo(() => {
    const map: Record<StageId, StageStatus | undefined> = {} as any;
    for (const s of STAGE_ORDER) {
      map[s] = statuses.find(x => x.stage === s);
    }
    return map;
  }, [statuses]);

  /* Reset predictions for ONE stage, scoped to the selected group.
   * Every delete is mirrored to predictions_backup automatically by the
   * API — recoverable via the "שחזר ניחושים" button below. */
  async function resetStagePredictions(stage: StageId) {
    if (!groupId) { alert("בחר קבוצה."); return; }
    const grp = groups.find(g => g.id === groupId);
    if (!confirm(
      `לאפס את הניחושים של "${grp?.name || groupId}" בשלב "${STAGE_NAMES[stage]}"?\n\n` +
      `הניחושים נשמרים אוטומטית בגיבוי וניתן לשחזר אותם בלחיצה.\n` +
      `פעולה זו לא נוגעת בתוצאות אמת, במשתמשים או בקבוצות.`
    )) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/sim/clear-stage", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ stage, groupId }),
      });
      const data = await r.json();
      if (!r.ok) {
        alert(`שגיאה: ${data.error || r.status}`);
        return;
      }
      alert(`✓ נמחקו ${data.deletedPredictions || 0} ניחושים בשלב "${STAGE_NAMES[stage]}".\nניתן לשחזר אותם דרך "🔄 שחזר ניחושים".`);
    } catch (e: any) {
      alert(`שגיאה: ${e?.message || e}`);
    } finally {
      setBusy(false);
      await reloadStatus();
    }
  }

  /* Restore deleted predictions for one stage from the backup collection.
   * `onlyIfMissing: true` means we won't overwrite predictions that
   * already exist live — restore is purely additive. */
  async function restoreStagePredictions(stage: StageId) {
    if (!groupId) { alert("בחר קבוצה."); return; }
    const grp = groups.find(g => g.id === groupId);
    if (!confirm(
      `לשחזר ניחושים שנמחקו של "${grp?.name || groupId}" בשלב "${STAGE_NAMES[stage]}"?\n\n` +
      `נשחזרו רק ניחושים שנמחקו (לא נדרסים ניחושים קיימים).`
    )) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/restore-predictions", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ groupId, stage, onlyIfMissing: true }),
      });
      const data = await r.json();
      if (!r.ok) {
        alert(`שגיאה: ${data.error || r.status}`);
        return;
      }
      alert(
        `✓ שוחזרו ${data.restored || 0} ניחושים.\n` +
        `דולגו (קיימים כבר): ${data.skippedExisting || 0}.`
      );
    } catch (e: any) {
      alert(`שגיאה: ${e?.message || e}`);
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
        איפוס ניחושים לחברי קבוצה לפי שלב.
        תוצאות אמת מגיעות אוטומטית מ-FIFA דרך ה-API החי, ולא מנוהלות כאן.
      </p>

      {/* Group picker */}
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
      </div>

      {/* Per-stage reset — always clickable when a group is selected */}
      <div className="sim-workflow-grid">
        <div className="sim-workflow">
          {STAGE_ORDER.map(s => {
            const st = statusByStage[s];
            const filled = st?.predictionsFilled ?? 0;
            const total  = st?.predictionsTotal ?? 0;
            const hasPredictions = filled > 0;

            return (
              <div key={s} className="sim-stage-card">
                <header className="sim-stage-head">
                  <span style={{ fontSize: 22 }}>{STAGE_EMOJI[s]}</span>
                  <span className="sim-stage-title">{STAGE_NAMES[s]}</span>
                  {hasPredictions && (
                    <span className="sim-badge sim-badge-done">{filled}/{total} ניחושים</span>
                  )}
                </header>

                <div className="sim-step">
                  <div className="sim-step-info">
                    <span style={{ color: "var(--red)" }}>🧹 אפס ניחושים בשלב זה</span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      מוחק לכל חברי הקבוצה הנבחרת — גיבוי נשמר אוטומטית
                    </span>
                  </div>
                  <button
                    className="btn btn-small"
                    style={{
                      background: "rgba(239,68,68,0.12)",
                      borderColor: "var(--red)",
                      color: "var(--red)",
                    }}
                    disabled={busy || !groupId}
                    onClick={() => resetStagePredictions(s)}
                    title={!groupId ? "בחר קבוצה" : "אפס ניחושים בשלב"}
                  >
                    🧹 אפס שלב
                  </button>
                </div>

                <div className="sim-step">
                  <div className="sim-step-info">
                    <span style={{ color: "var(--accent)" }}>🔄 שחזר ניחושים מהגיבוי</span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      משחזר ניחושים שנמחקו לחברי הקבוצה (לא דורס קיימים)
                    </span>
                  </div>
                  <button
                    className="btn btn-small"
                    style={{
                      background: "rgba(80,180,255,0.12)",
                      borderColor: "var(--accent)",
                      color: "var(--accent)",
                    }}
                    disabled={busy || !groupId}
                    onClick={() => restoreStagePredictions(s)}
                    title={!groupId ? "בחר קבוצה" : "שחזר ניחושים מהגיבוי"}
                  >
                    🔄 שחזר
                  </button>
                </div>
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
                const st = statusByStage[s];
                const filled = st?.predictionsFilled ?? 0;
                const total  = st?.predictionsTotal ?? 0;
                const icon = filled === 0 ? "⚪" : filled < total ? "🟡" : "🟢";
                return (
                  <tr key={s}>
                    <td><span style={{ marginInlineEnd: 4 }}>{STAGE_EMOJI[s]}</span>{STAGE_NAMES[s]}</td>
                    <td>{icon} {filled}/{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </aside>
      </div>
    </section>
  );
}
