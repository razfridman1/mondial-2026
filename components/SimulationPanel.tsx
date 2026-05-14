"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";
import { MATCHES, STAGES } from "@/lib/data";
import { SIM_PRESETS } from "@/lib/sim";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";

interface GroupRow {
  id: string;
  name: string;
  memberCount?: number;
  members?: Array<{ uid: string; role?: string }>;
}

const STAGE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "ALL",      label: "כל השלבים" },
  { id: "GROUP",    label: "שלב הבתים" },
  { id: "KNOCKOUT", label: "כל שלבי הנוקאאוט" },
  { id: "R32",      label: "שלב 32" },
  { id: "R16",      label: "שלב 16" },
  { id: "QF",       label: "רבע גמר" },
  { id: "SF",       label: "חצי גמר" },
  { id: "THIRD",    label: "המקום השלישי" },
  { id: "FINAL",    label: "הגמר" },
];

export default function SimulationPanel() {
  const user = useStore(s => s.user);
  const sim = useStore(s => s.simConfig);
  const [busy, setBusy] = useState(false);
  const [presetId, setPresetId] = useState("10m");
  const [anchorId, setAnchorId] = useState(MATCHES[0]?.id || "M001");
  const [label, setLabel] = useState("");

  /* Group filling state */
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [fillGroupId, setFillGroupId] = useState<string>("");
  const [fillStage, setFillStage] = useState<string>("ALL");
  const [includePh, setIncludePh] = useState(false);

  async function authHeaders() {
    const token = await getFirebase().auth!.currentUser!.getIdToken();
    return { "content-type": "application/json", authorization: `Bearer ${token}` };
  }

  /* Load groups list (admin-only). Re-run via reloadGroups() after any action. */
  async function reloadGroups() {
    if (!user?.isAdmin) return;
    try {
      const r = await fetch("/api/admin/groups", { headers: await authHeaders() });
      if (r.ok) {
        const data = await r.json();
        setGroups(data);
        if (!fillGroupId && data[0]) setFillGroupId(data[0].id);
      }
    } catch {}
  }
  useEffect(() => { reloadGroups(); }, [user?.isAdmin]);

  async function randomFill() {
    if (!fillGroupId) { alert("בחר קבוצה."); return; }
    const stageLabel = STAGE_OPTIONS.find(s => s.id === fillStage)?.label || fillStage;
    const group = groups.find(g => g.id === fillGroupId);
    if (!confirm(
      `למלא ניחושים רנדומליים לכל חברי "${group?.name || fillGroupId}"?\n` +
      `שלב: ${stageLabel}\n` +
      (includePh ? "כולל משחקים שעוד אין להם קבוצות (placeholder)\n" : "") +
      "\nניחושים קיימים יידרסו."
    )) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/sim/random-fill", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ groupId: fillGroupId, stage: fillStage, includePlaceholders: includePh }),
      });
      const data = await r.json();
      if (!r.ok) { alert(`שגיאה: ${data.error || r.status}`); return; }
      alert(`✓ מולאו ${data.filled} ניחושים\n${data.users} משתמשים × ${data.matches} משחקים`);
    } finally { setBusy(false); }
  }

  async function instantResults() {
    const stageLabel = STAGE_OPTIONS.find(s => s.id === fillStage)?.label || fillStage;
    if (!confirm(
      `ליצור תוצאות מיידיות לכל המשחקים בשלב "${stageLabel}"?\n` +
      "התוצאות יהיו רנדומליות (0-3 שערים). משחקים שכבר יש להם תוצאה — לא ידרסו."
    )) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/sim/instant-results", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ stage: fillStage, includePlaceholders: includePh }),
      });
      const data = await r.json();
      if (!r.ok) { alert(`שגיאה: ${data.error || r.status}`); return; }
      alert(`✓ נוצרו ${data.inserted} תוצאות${data.skipped ? ` (דולגו ${data.skipped} עם תוצאה קיימת)` : ""}`);
    } finally { setBusy(false); }
  }

  async function clearResultsOnly() {
    const stageLabel = STAGE_OPTIONS.find(s => s.id === fillStage)?.label || fillStage;
    if (!confirm(`למחוק את כל התוצאות בשלב "${stageLabel}"?`)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/sim/instant-results", {
        method: "DELETE",
        headers: await authHeaders(),
        body: JSON.stringify({ stage: fillStage }),
      });
      const data = await r.json();
      if (!r.ok) { alert(`שגיאה: ${data.error || r.status}`); return; }
      alert(`✓ נמחקו ${data.deleted} תוצאות`);
    } finally { setBusy(false); }
  }

  /* One-click: generate random results for a specific stage only */
  async function instantResultsForStage(stageId: string, stageLabel: string, matchCount: number) {
    if (!confirm(
      `ליצור תוצאות אקראיות ל-${matchCount} משחקי "${stageLabel}"?\n` +
      "תוצאות קיימות יידרסו."
    )) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/sim/instant-results", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ stage: stageId, includePlaceholders: true, overwrite: true }),
      });
      const data = await r.json();
      if (!r.ok) { alert(`שגיאה: ${data.error || r.status}`); return; }
      alert(`✓ נוצרו ${data.inserted} תוצאות ל"${stageLabel}"`);
    } finally { setBusy(false); }
  }

  /* Realistic simulation using betting odds — Brazil more likely to beat Cameroon */
  async function oddsWeightedSim() {
    if (!confirm(
      "🎲 סימולציה משוקללת לפי יחסי הימורים\n\n" +
      "פעולה זו תיצור תוצאות לכל 104 המשחקים — אבל הפעם **לא רנדומלי לחלוטין**:\n" +
      "• המועדפות לפי ה‑odds תנצחנה ברוב המקרים\n" +
      "• הפתעות יקרו לפי הסיכוי\n" +
      "• בנוקאאוט — אין תיקו (יקבע מנצח לפי odds)\n\n" +
      "תוצאות קיימות יידרסו. להמשיך?"
    )) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/sim/odds-weighted", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ stage: "ALL", overwrite: true }),
      });
      const data = await r.json();
      if (!r.ok) { alert(`שגיאה: ${data.error || r.status}`); return; }
      alert(`✓ נוצרו ${data.inserted} תוצאות משוקללות לפי odds`);
    } finally { setBusy(false); }
  }

  /* One-click: generate random results for ALL 104 matches across every stage */
  async function instantResultsAll() {
    if (!confirm(
      "ליצור תוצאות אקראיות לכל 104 המשחקים בכל השלבים?\n" +
      "פעולה זו תיצור תוצאות לכל הטורניר בבת אחת — לרבות שלבי נוקאאוט שעוד לא נקבעו.\n" +
      "תוצאות קיימות יידרסו."
    )) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/sim/instant-results", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ stage: "ALL", includePlaceholders: true, overwrite: true }),
      });
      const data = await r.json();
      if (!r.ok) { alert(`שגיאה: ${data.error || r.status}`); return; }
      alert(`✓ נוצרו ${data.inserted} תוצאות לכל המונדיאל`);
    } finally { setBusy(false); }
  }

  /* Lighter reset: only clears simulation state (sim-marked results + overrides + sim config),
   * does NOT delete predictions, real match results, or user data. */
  async function resetSimulationOnly() {
    if (!confirm(
      "🔄 איפוס סימולציה בלבד\n\n" +
      "פעולה זו תמחק:\n" +
      "• תוצאות שנוצרו על-ידי הסימולציה (sim:true בלבד)\n" +
      "• כל ה‑broadcast overrides\n" +
      "• תכבה את מצב הסימולציה הזמן‑אמת\n\n" +
      "✅ הניחושים של המשתמשים, הקבוצות, הפרופילים, ותוצאות אמיתיות שהוזנו ידנית — יישמרו.\n\n" +
      "להמשיך?"
    )) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/sim/reset", {
        method: "POST",
        headers: await authHeaders(),
      });
      const data = await r.json();
      if (!r.ok) { alert(`שגיאה: ${data.error || r.status}`); return; }
      const c = data.counts;
      alert(`✓ הסימולציה אופסה\n\nתוצאות: ${c.results}\nOverrides: ${c.overrides}`);
    } finally { setBusy(false); }
  }

  async function fullReset() {
    if (!confirm(
      "🔄 איפוס כללי\n\n" +
      "פעולה זו תמחק:\n" +
      "• כל הניחושים של כל המשתמשים\n" +
      "• תוצאות שנוצרו על-ידי הסימולציה בלבד (תוצאות אמיתיות יישמרו!)\n" +
      "• כל ה‑broadcast overrides\n" +
      "• כל פיד הפעילות\n" +
      "• תכבה את מצב הסימולציה\n\n" +
      "✅ משתמשים, קבוצות, חברויות, פרופילים, ותוצאות אמיתיות שהוזנו ידנית — יישמרו.\n\n" +
      "להמשיך?"
    )) return;
    if (!confirm("פעולה בלתי הפיכה! לאשר סופית?")) return;
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
        `✓ איפוס הושלם\n\n` +
        `ניחושים: ${c.predictions}\n` +
        `תוצאות: ${c.results}\n` +
        `Overrides: ${c.overrides}\n` +
        `פיד פעילות: ${c.activity}\n\n` +
        `המערכת נקייה ומוכנה לבדיקות חדשות.`
      );
    } finally { setBusy(false); }
  }

  async function clearPredictions(scope: "group" | "all") {
    let body: any = {};
    let msg = "";
    if (scope === "group") {
      if (!fillGroupId) { alert("בחר קבוצה."); return; }
      const group = groups.find(g => g.id === fillGroupId);
      body = { groupId: fillGroupId };
      msg = `למחוק את כל הניחושים של כל חברי "${group?.name || fillGroupId}"?`;
    } else {
      body = {};
      msg = "⚠️ למחוק את כל הניחושים של כל המשתמשים במערכת?\nפעולה זו לא ניתנת לביטול.";
    }
    if (!confirm(msg)) return;
    if (scope === "all" && !confirm("פעולה בלתי הפיכה! האם אתה בטוח לחלוטין?")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/sim/random-fill", {
        method: "DELETE",
        headers: await authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { alert(`שגיאה: ${data.error || r.status}`); return; }
      alert(`✓ נמחקו ${data.deletedPredictions} ניחושים`);
    } finally { setBusy(false); }
  }

  async function start() {
    if (!confirm("להפעיל סימולציה? כל ערכי הזמן באפליקציה יזוזו זמנית.")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/simulation", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          presetId,
          anchorMatchId: anchorId,
          label: label || undefined,
          resultsAuto: true,
          clearResults: true,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        alert(`שגיאה: ${e.error || r.status}`);
        return;
      }
      alert("הסימולציה הופעלה ✓ המשחק הראשון יתחיל בעוד דקה-שתיים.");
    } finally { setBusy(false); }
  }

  async function stop() {
    if (!confirm("⚠️ זהירות!\n\nלחיצה על כפתור זה תחזיר את האפליקציה למצב המונדיאל האמיתי (11.6.2026).\nכל תוצאות הסימולציה יימחקו.\n\nלחץ רק כשאתה באמת מוכן ולא מתכוון להריץ סבבי בדיקה נוספים.\n\nלהמשיך?")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/simulation", { method: "DELETE", headers: await authHeaders() });
      if (!r.ok) { alert("שגיאה"); return; }
      alert("חזרת למצב מונדיאל אמיתי. בהצלחה!");
    } finally { setBusy(false); }
  }

  /* "Stop & start new round" — clears current sim and clears its results,
   * but stays in simulation-management mode so admin can immediately
   * configure & launch another round. */
  async function newRound() {
    if (!confirm("לסיים את הסבב הנוכחי ולהתחיל סבב חדש?\nתוצאות הסבב הנוכחי יימחקו. הניחושים של המשתמשים נשמרים.")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/simulation", { method: "DELETE", headers: await authHeaders() });
      if (!r.ok) { alert("שגיאה"); return; }
      // Stay on the panel; the form will reappear because sim is now disabled.
      // Keep the previous preset/anchor so admin can launch again with one click.
      alert("הסבב הסתיים. הגדר את הסבב הבא ולחץ 'הפעל סימולציה'.");
    } finally { setBusy(false); }
  }

  async function manualTick() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/simulation/tick");
      const data = await r.json();
      alert(`Tick הסתיים. נוצרו תוצאות חדשות: ${data.inserted || 0}.`);
    } finally { setBusy(false); }
  }

  if (!user) return (
    <div className="admin-locked">
      <h3>🔒 ניהול סימולציה</h3>
      <p className="muted">צריך להתחבר כדי לגשת לפאנל הסימולציה.</p>
      <a href="/login" className="btn btn-primary">כניסה</a>
    </div>
  );
  if (!user.isAdmin) return (
    <div className="admin-locked">
      <h3>🔒 ניהול סימולציה — Super Admin בלבד</h3>
      <p className="muted">אין לך הרשאת אדמין. לפתיחת גישה:</p>
      <ol style={{ textAlign: "right", maxWidth: 540, margin: "10px auto" }}>
        <li>ערוך את <code>.env.local</code> בפרויקט</li>
        <li>הוסף את האימייל שלך ל-<code>ADMIN_EMAILS</code></li>
        <li>הפעל מחדש את השרת והתחבר שוב</li>
      </ol>
      <p className="muted">משתמש מחובר: <strong>{user.email}</strong></p>
    </div>
  );

  const preset = SIM_PRESETS.find(p => p.id === presetId);
  const anchor = MATCHES.find(m => m.id === anchorId);

  return (
    <section style={{ marginTop: 26 }}>
      <div className="admin-bar">
        <h3>🧪 סימולציה למונדיאל — מצב בדיקה</h3>
        {sim?.enabled
          ? <span className="badge badge-live">🔴 פעיל</span>
          : <span className="status-pill pill-open">💤 כבוי</span>}
      </div>

      <div className="sim-help">
        <p className="muted">
          הסימולציה מזיזה את כל לוח המשחקים זמנית — אתה וחברים יכולים לבדוק את כל הזרימה:
          ניחושים, נעילות, leaderboard, פיד פעילות — בלי לחכות ליוני 2026.
        </p>
        <p className="muted">
          תוצאות מתחוללות אוטומטית עם סוף כל משחק. ניתן להריץ <strong>כמה סבבי סימולציה ברצף</strong>:
          סיים את הסבב הנוכחי → הגדר חדש → צא לדרך. רק כשתסיים סופית את כל הבדיקות וזה אכן הזמן להחזיר את האפליקציה למצב המונדיאל האמיתי — לחץ על הכפתור האדום.
        </p>
        <div style={{
          marginTop: 10, padding: 10,
          background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.3)",
          borderRadius: 8,
          fontSize: 12, lineHeight: 1.6,
        }}>
          🛡️ <strong>הפרדה בין מצב סימולציה למצב אמיתי:</strong> כל תוצאה שנוצרת על-ידי הסימולציה מסומנת במערכת כ‑<code>sim: true</code>.
          כשמסיימים את הסימולציה — נמחקות <em>רק</em> התוצאות המסומנות כך.
          תוצאות אמיתיות שתזין דרך 🏁 <strong>ניהול תוצאות</strong> (פעם שהמונדיאל יתחיל ב‑11.6.2026) <strong>לא יסומנו כ‑sim</strong>,
          ולכן כל הסקריפטים של איפוס סימולציה לא יגעו בהן. המעבר ממצב בדיקה למצב אמיתי הוא חלק לחלוטין.
        </div>
      </div>

      {sim?.enabled ? (
        <div className="sim-active">
          <div className="sim-active-row">
            <strong>סימולציה פעילה{sim.label ? ` — ${sim.label}` : ""}</strong>
            <span className="muted">{new Date(sim.updatedAt).toLocaleString("he-IL")}</span>
          </div>
          <div className="sim-grid">
            <div><span className="muted">תחילת הסימולציה:</span> {new Date(sim.startedAt).toLocaleString("he-IL")}</div>
            <div><span className="muted">מכפיל מהירות:</span> {sim.speedMultiplier.toFixed(2)}× ({(39*24/sim.speedMultiplier).toFixed(2)} שעות לכל המונדיאל)</div>
            <div><span className="muted">תוצאות אוטומטיות:</span> {sim.resultsAuto ? "פעיל" : "כבוי"}</div>
            <div><span className="muted">הופעל על-ידי:</span> {sim.updatedBy || "—"}</div>
          </div>
          <div className="mc-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={manualTick} disabled={busy}>
              ⏯️ הרץ Tick ידני (תיצור תוצאות שסיימו)
            </button>
            <button className="btn"
                    style={{ background: "rgba(167,139,250,0.15)", borderColor: "var(--purple)", color: "var(--purple)" }}
                    onClick={newRound} disabled={busy}>
              🔄 סיים סבב והתחל סבב חדש
            </button>
            <button className="btn"
                    style={{ background: "rgba(239,68,68,0.15)", borderColor: "var(--red)", color: "var(--red)" }}
                    onClick={stop} disabled={busy}>
              🚫 לא ללחוץ עד שאתה מוכן (חזרה למצב אמיתי)
            </button>
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            ℹ️ <strong>סבב חדש</strong>: מסיים את הסבב הנוכחי ומאפשר לך לפתוח אחד חדש (לבדיקות חוזרות).<br/>
            ⚠️ <strong>חזרה למצב אמיתי</strong>: כפתור סופי. ימחק את כל תוצאות הסימולציה ויחזיר את האפליקציה למצב המונדיאל ב-11.6.2026. אל תלחץ עד שסיימת לחלוטין את כל סבבי הבדיקה.
          </p>
        </div>
      ) : (
        <div className="sim-setup">
          <div className="sim-row">
            <label>⚡ מהירות:</label>
            <select value={presetId} onChange={e => setPresetId(e.target.value)} disabled={busy}>
              {SIM_PRESETS.map(p => (
                <option key={p.id} value={p.id}>
                  {p.label} (×{p.speedMultiplier})
                </option>
              ))}
            </select>
          </div>

          <div className="sim-row">
            <label>📅 משחק עוגן (יתחיל ראשון):</label>
            <select value={anchorId} onChange={e => setAnchorId(e.target.value)} disabled={busy} style={{ maxWidth: 400 }}>
              {MATCHES.slice(0, 30).map(m => (
                <option key={m.id} value={m.id}>
                  {m.id}: {m.home} vs {m.away} ({formatIsraelDate(m.utc, { short: true })} {formatIsraelTime(m.utc)})
                </option>
              ))}
            </select>
          </div>

          <div className="sim-row">
            <label>🏷️ תווית (אופציונלי):</label>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)}
                   placeholder='למשל "סיבוב בדיקה עם החברים"' disabled={busy} />
          </div>

          {preset && anchor && (
            <div className="sim-preview muted">
              📋 בלחיצה: <strong>{preset.label}</strong>. המשחק <strong>{anchor.home} vs {anchor.away}</strong> יתחיל בעוד כ-{preset.minutesUntilFirstMatch} דק׳, שאר 103 המשחקים יחולקו על פני {(39*24/preset.speedMultiplier).toFixed(2)} שעות.
            </div>
          )}

          <div className="mc-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={start} disabled={busy}>
              ▶ הפעל סימולציה
            </button>
          </div>
        </div>
      )}

      {/* ============= קיצורי דרך מהירים ============= */}
      <div style={{
        marginTop: 24, padding: 14,
        background: "linear-gradient(135deg, rgba(0,212,255,0.08), rgba(46,107,255,0.06))",
        border: "1px solid var(--accent)",
        borderRadius: 12,
      }}>
        <h4 style={{ marginTop: 0, marginBottom: 10 }}>⚡ פעולות מהירות</h4>

        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, opacity: 0.85 }}>
          תוצאות מיידיות לפי שלב:
        </div>
        <div className="mc-actions" style={{ flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {(() => {
            const STAGE_BTNS: Array<{ id: string; label: string }> = [
              { id: "GROUP", label: "שלב הבתים" },
              { id: "R32",   label: "שלב 32" },
              { id: "R16",   label: "שלב 16" },
              { id: "QF",    label: "רבע גמר" },
              { id: "SF",    label: "חצי גמר" },
              { id: "THIRD", label: "3-4" },
              { id: "FINAL", label: "הגמר" },
            ];
            const countByStage = MATCHES.reduce((acc, m) => {
              acc[m.stage] = (acc[m.stage] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);
            return STAGE_BTNS.map(s => (
              <button
                key={s.id}
                className="btn"
                style={{
                  background: "linear-gradient(135deg, #22c55e, #16a34a)",
                  borderColor: "#16a34a",
                  color: "#fff", fontWeight: 700,
                }}
                onClick={() => instantResultsForStage(s.id, s.label, countByStage[s.id] || 0)}
                disabled={busy}
                title={`צור תוצאות ל-${countByStage[s.id] || 0} משחקים בשלב "${s.label}"`}
              >
                ⚽ {s.label}
                <span style={{
                  marginInlineStart: 6,
                  background: "rgba(0,0,0,0.18)",
                  padding: "1px 7px",
                  borderRadius: 999,
                  fontSize: 11,
                }}>{countByStage[s.id] || 0}</span>
              </button>
            ));
          })()}
        </div>

        <div className="mc-actions" style={{ flexWrap: "wrap", gap: 10 }}>
          <button className="btn btn-primary"
                  style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", borderColor: "#16a34a", fontWeight: 700 }}
                  onClick={instantResultsAll} disabled={busy}>
            ⚽⚽ תוצאות רנדומליות לכל 104 המשחקים
          </button>
          <button className="btn btn-primary"
                  style={{ background: "linear-gradient(135deg, #f59e0b, #ea580c)", borderColor: "#ea580c", fontWeight: 700 }}
                  onClick={oddsWeightedSim} disabled={busy}>
            🎲 סימולציה משוקללת לפי odds
          </button>
          <button className="btn"
                  style={{ background: "rgba(167,139,250,0.15)", borderColor: "var(--purple)", color: "var(--purple)", fontWeight: 700 }}
                  onClick={resetSimulationOnly} disabled={busy}>
            🔄 אפס סימולציה בלבד
          </button>
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.6 }}>
          ⚽ <strong>כפתור לכל שלב:</strong> תוצאות אקראיות רק לאותו שלב.<br/>
          ⚽⚽ <strong>תוצאות רנדומליות:</strong> אקראי לחלוטין לכל 104 המשחקים.<br/>
          🎲 <strong>משוקללת לפי odds:</strong> המועדפות מנצחות לפי הסיכוי. הפתעות קורות, בנוקאאוט אין תיקו. תוצאות יותר ריאליסטיות לבדיקת לוחות התוצאות.<br/>
          🔄 <strong>אפס סימולציה:</strong> מוחק תוצאות + overrides + מכבה סימולציה. <strong>הניחושים נשמרים!</strong>
        </p>
      </div>

      {/* ============= סימולציה לפי שלבים ============= */}
      <div style={{
        marginTop: 16, padding: 16,
        background: "var(--bg-card)", border: "1px solid var(--border-soft)",
        borderRadius: 12,
      }}>
        <h4 style={{ marginTop: 0, marginBottom: 6 }}>🎲 סימולציה מיידית לפי שלבים</h4>
        <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
          זרימת עבודה לבדיקות: <strong>1)</strong> מלא ניחושים לשלב הנוכחי →
          <strong> 2)</strong> צור תוצאות מיידיות לאותו שלב →
          <strong> 3)</strong> צפה בשינויים ב‑leaderboard וב"הניחושים שלי" →
          <strong> 4)</strong> עבור לשלב הבא וחזור.
        </p>
        <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
          ⚡ אין צורך בסימולציה זמן‑אמת לבדיקות האלה — הכל מיידי.
        </p>

        <div className="sim-row" style={{ alignItems: "center" }}>
          <label>👥 קבוצה:</label>
          <select value={fillGroupId} onChange={e => setFillGroupId(e.target.value)} disabled={busy} style={{ flex: 1 }}>
            <option value="">— בחר קבוצה —</option>
            {groups.map(g => {
              const actualCount = g.members?.length ?? g.memberCount ?? 0;
              return (
                <option key={g.id} value={g.id}>
                  {g.name} ({actualCount} חברים)
                </option>
              );
            })}
          </select>
          <button
            type="button"
            className="btn btn-small"
            onClick={reloadGroups}
            disabled={busy}
            title="טען מחדש את רשימת הקבוצות (אחרי שינויים בניהול משתמשים)"
          >
            ↻
          </button>
        </div>
        {fillGroupId && (() => {
          const g = groups.find(x => x.id === fillGroupId);
          const memberCount = g?.members?.length ?? g?.memberCount ?? 0;
          if (memberCount === 0) {
            return (
              <p style={{
                fontSize: 12, color: "var(--orange)",
                background: "rgba(245,158,11,0.10)",
                padding: "6px 10px", borderRadius: 6, margin: "4px 0",
              }}>
                ⚠ לקבוצה הזו אין חברים. מילוי ניחושים לא יעשה כלום.
              </p>
            );
          }
          return null;
        })()}

        <div className="sim-row">
          <label>🏁 שלב:</label>
          <select value={fillStage} onChange={e => setFillStage(e.target.value)} disabled={busy}>
            {STAGE_OPTIONS.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="sim-row">
          <label>
            <input type="checkbox" checked={includePh} onChange={e => setIncludePh(e.target.checked)} disabled={busy} />
            {" "}כלול משחקי נוקאאוט שעוד אין להם קבוצות (placeholder)
          </label>
        </div>

        <div style={{ marginTop: 14, padding: 12, background: "var(--bg-elev)", borderRadius: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>שלב 1️⃣ — ניחושים</div>
          <div className="mc-actions" style={{ flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={randomFill} disabled={busy || !fillGroupId}>
              🎲 מלא ניחושים רנדומליים לקבוצה
            </button>
            <button className="btn"
                    style={{ background: "rgba(245,158,11,0.15)", borderColor: "var(--orange)", color: "var(--orange)" }}
                    onClick={() => clearPredictions("group")} disabled={busy || !fillGroupId}>
              🗑️ נקה ניחושים של הקבוצה
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, padding: 12, background: "var(--bg-elev)", borderRadius: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>שלב 2️⃣ — תוצאות (לאחר שכולם ניחשו)</div>
          <div className="mc-actions" style={{ flexWrap: "wrap" }}>
            <button className="btn btn-primary"
                    style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", borderColor: "#16a34a" }}
                    onClick={instantResults} disabled={busy}>
              ⚽ צור תוצאות מיידיות לשלב
            </button>
            <button className="btn"
                    style={{ background: "rgba(245,158,11,0.15)", borderColor: "var(--orange)", color: "var(--orange)" }}
                    onClick={clearResultsOnly} disabled={busy}>
              🗑️ מחק תוצאות של השלב
            </button>
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            ⚡ תוצאות מיוצרות מיידית (לא ידרסו תוצאות קיימות). אחרי שנוצרו —
            ה‑leaderboard מתעדכן אוטומטית לפי הניחושים שכבר היו.
          </p>
        </div>

        <p className="muted" style={{ fontSize: 11, marginTop: 14, lineHeight: 1.6 }}>
          💡 <strong>זרימה מומלצת:</strong> בחר "שלב הבתים" → 🎲 → ⚽ → צפה ב‑leaderboard
          → בחר "שלב 16" + סמן ✓ "כלול placeholders" → 🎲 → ⚽ → וכך הלאה עד הגמר.
        </p>
      </div>

      {/* ============= איפוס כללי ============= */}
      <div style={{
        marginTop: 20, padding: 16,
        background: "rgba(239,68,68,0.05)",
        border: "1px solid rgba(239,68,68,0.3)",
        borderRadius: 12,
      }}>
        <h4 style={{ marginTop: 0, marginBottom: 6, color: "var(--red)" }}>🔄 איפוס כללי — חזרה למצב טרום בדיקות</h4>
        <p className="muted" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.6 }}>
          מוחק את כל הניחושים, כל התוצאות, את כל ה‑broadcast overrides, את פיד הפעילות,
          ומכבה את הסימולציה. <strong>המשתמשים, הקבוצות, והחברויות יישמרו.</strong>
          מומלץ להריץ זאת כשתסיים את כל בדיקות הסימולציה לפני המונדיאל האמיתי.
        </p>
        <div className="mc-actions">
          <button className="btn"
                  style={{ background: "rgba(239,68,68,0.15)", borderColor: "var(--red)", color: "var(--red)", fontWeight: 700 }}
                  onClick={fullReset} disabled={busy}>
            🔄 איפוס כללי
          </button>
          <button className="btn"
                  style={{ background: "rgba(239,68,68,0.10)", borderColor: "var(--red)", color: "var(--red)" }}
                  onClick={() => clearPredictions("all")} disabled={busy}>
            ⚠️ נקה רק ניחושים (לא תוצאות)
          </button>
        </div>
      </div>
    </section>
  );
}
