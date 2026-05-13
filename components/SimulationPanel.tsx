"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";
import { MATCHES } from "@/lib/data";
import { SIM_PRESETS } from "@/lib/sim";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";

export default function SimulationPanel() {
  const user = useStore(s => s.user);
  const sim = useStore(s => s.simConfig);
  const [busy, setBusy] = useState(false);
  const [presetId, setPresetId] = useState("10m");
  const [anchorId, setAnchorId] = useState(MATCHES[0]?.id || "M001");
  const [label, setLabel] = useState("");

  async function authHeaders() {
    const token = await getFirebase().auth!.currentUser!.getIdToken();
    return { "content-type": "application/json", authorization: `Bearer ${token}` };
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
    </section>
  );
}
