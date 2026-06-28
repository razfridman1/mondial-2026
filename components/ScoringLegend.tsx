"use client";

/* =====================================================================
 * ScoringLegend — shared quick-reference card that explains how points
 * are awarded. Used both inline (profile hero) and inside a modal
 * (opened from the "מפתח ניקוד" button next to "שתף טבלה").
 * ===================================================================*/
export function ScoringLegend() {
  return (
    <aside className="scoring-legend" aria-label="מפתח ניקוד">
      <div className="scoring-legend-title">🧮 מפתח ניקוד</div>

      <div className="scoring-legend-section">
        <div className="scoring-legend-stage">🏟 שלב הבתים</div>
        <ul>
          <li><span className="pts pts-gold">7</span> תוצאה מדויקת</li>
          <li><span className="pts pts-silver">4</span> תוצאה נכונה + הפרש שערים</li>
          <li><span className="pts pts-bronze">3</span> רק תוצאה נכונה (מנצח/תיקו)</li>
        </ul>
      </div>

      <div className="scoring-legend-section">
        <div className="scoring-legend-stage">🥊 שלבי נוקאאוט</div>
        <ul>
          <li><span className="pts pts-gold">8</span> תוצאה מדויקת ב-90 דק׳ + מנצח נכון</li>
          <li><span className="pts pts-silver">5</span> מנצח נכון + הפרש שערים זהה ב-90 דק׳</li>
          <li><span className="pts pts-bronze">3</span> רק מנצח נכון</li>
          <li><span className="pts pts-zero">0</span> מנצח שגוי — גם אם התוצאה ב-90 דק׳ נכונה</li>
        </ul>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          ⚠️ התוצאה מתייחסת לסוף 90 הדקות. אם יש תיקו ב-90 דק׳, המשחק נמשך להארכה (2×15 דק׳) — הניחוש שלך הוא לתוצאה אחרי ה-90 דק׳, והמנצח הוא מי שמעפיל בסוף (כולל הארכה ופנדלים אם צריך).
        </div>
      </div>

      <div className="scoring-legend-bonus">
        <span className="pts pts-fire">🔥 +1</span>
        <span>בונוס מהניחוש הנכון השני ברצף ואילך</span>
      </div>

      <div className="scoring-legend-section">
        <div className="scoring-legend-stage">🏆 ניחושי טורניר</div>
        <ul>
          <li><span className="pts pts-gold">12</span> ניחוש נכון של זוכת המונדיאל</li>
          <li><span className="pts pts-gold">12</span> ניחוש נכון של מלך השערים</li>
          <li><span className="pts pts-gold">12</span> ניחוש נכון של מלך הבישולים</li>
        </ul>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          ניחוש זוכה ניתן לשינוי עד תחילת שלב 8 האחרונות.
          ניחוש מלך השערים/בישולים ניתן לשינוי עד סיום שלב הבתים.
        </div>
      </div>
    </aside>
  );
}

/* Modal wrapper — opened from the "מפתח ניקוד" button. */
export function ScoringLegendModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 420 }}>
        <button className="modal-close" onClick={onClose} aria-label="סגור">✕</button>
        <header className="modal-header">
          <h2>🧮 מפתח ניקוד</h2>
        </header>
        <ScoringLegend />
      </div>
    </div>
  );
}
