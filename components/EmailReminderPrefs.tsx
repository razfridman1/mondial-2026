"use client";
import { useStore } from "@/lib/store";

export default function EmailReminderPrefs() {
  const user = useStore(s => s.user);
  const prefs = useStore(s => s.emailPrefs);
  const updateEmailPrefs = useStore(s => s.updateEmailPrefs);

  if (!user) return null;
  const p = prefs || {
    uid: user.uid, email: user.email || "",
    enabled: false, h60: false, m15: false, betsClose: false,
    updatedAt: 0,
  };

  return (
    <details className="ai-section" style={{ marginBottom: 14 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 16 }}>
        ✉️ תזכורות באימייל ({p.enabled ? "פעיל" : "מושבת"})
      </summary>
      <p className="muted" style={{ marginTop: 8 }}>
        שלח לי תזכורות אוטומטיות לכתובת <strong>{user.email}</strong>
      </p>
      <div className="email-pref">
        <input type="checkbox" id="email-enabled" checked={p.enabled}
               onChange={e => updateEmailPrefs({ enabled: e.target.checked })} />
        <label htmlFor="email-enabled">הפעל תזכורות באימייל</label>
      </div>
      <div className="email-pref">
        <input type="checkbox" id="email-h60" checked={p.h60}
               disabled={!p.enabled}
               onChange={e => updateEmailPrefs({ h60: e.target.checked })} />
        <label htmlFor="email-h60">⏰ שעה לפני המשחק</label>
      </div>
      <div className="email-pref">
        <input type="checkbox" id="email-m15" checked={p.m15}
               disabled={!p.enabled}
               onChange={e => updateEmailPrefs({ m15: e.target.checked })} />
        <label htmlFor="email-m15">⏰ 15 דקות לפני המשחק</label>
      </div>
      <div className="email-pref">
        <input type="checkbox" id="email-bets" checked={p.betsClose}
               disabled={!p.enabled}
               onChange={e => updateEmailPrefs({ betsClose: e.target.checked })} />
        <label htmlFor="email-bets">💰 ההימורים נסגרים בקרוב</label>
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
        טיפ: כדי לקבל תזכורות למשחק מסוים, סמן את כפתורי התזכורת על הכרטיס. המייל יישלח רק אם הפעלת גם את התזכורת הספציפית וגם את הסוג כאן.
      </p>
    </details>
  );
}
