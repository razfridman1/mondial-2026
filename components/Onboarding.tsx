"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { setUserDoc } from "@/lib/firebase";

interface Slide {
  emoji: string;
  title: string;
  body: string;
  highlight?: string;
}

const SLIDES: Slide[] = [
  {
    emoji: "⚽",
    title: "ברוכים הבאים למונדיאל 2026!",
    body: "האפליקציה שלך לכל מה שקורה במונדיאל בקנדה, מקסיקו וארה״ב — בעברית, עם שעון ישראל.",
    highlight: "104 משחקים · 48 קבוצות · 16 אצטדיונים",
  },
  {
    emoji: "🔮",
    title: "ניחושים = נקודות",
    body: "בשלב הבתים: פגיעה + תוצאה = 7 נק׳, פגיעה = 3, +1 על הפרש שערים נכון (לא בתיקו). בנוקאאוט: בוחרים מנצחת + ניקוד 90 דק׳. מנצחת + תוצאה = 8 נק׳, מנצחת + הפרש = 5, מנצחת לבד = 3.",
    highlight: "🔥 סטריקים — החל מהניחוש השני ברצף, כל ניחוש נכון נוסף שווה נקודת בונוס",
  },
  {
    emoji: "⏰",
    title: "נעילה 3 דקות לפני המשחק",
    body: "תוכל לעדכן את הניחוש שלך עד 3 דקות לפני שריקת הפתיחה — אחר כך נסגר אוטומטית. שכחת? המערכת תיתן לך ניחוש רנדומלי כדי שלא תפסיד נקודות לגמרי.",
    highlight: "🔒 נעילה אוטומטית — אין דרך לנחש אחרי שזה התחיל",
  },
  {
    emoji: "👥",
    title: "קבוצות חברים פרטיות",
    body: "פתח קבוצה משלך, קבל קוד הזמנה, ושתף עם החברים בווטסאפ. תראו leaderboard חי, פיד פעילות, ומי הכי טוב בניחושים.",
    highlight: "🏆 התחרות נגד החברים שלך — בזמן אמת",
  },
  {
    emoji: "🤖",
    title: "AI שעוזר לך לנצח",
    body: "צ׳אט AI לכל שאלה על שחקנים וקבוצות, Smart Insights שמסכם את הניחושים בקבוצה, ו-Roast Engine שעוקץ אותך על הניחושים הגרועים שלך 😎.",
  },
  {
    emoji: "🎯",
    title: "התאמה אישית",
    body: "בחר אווטר מ-20 אגדות (מסי, CR7, R9, מראדונה, פלה, ניימר...), סמן קבוצות אהובות, ובחר ערוצי שידור בישראל למעקב.",
    highlight: "מוכן? בוא נתחיל!",
  },
];

export default function Onboarding({ force = false, onClose }: { force?: boolean; onClose?: () => void }) {
  const user = useStore(s => s.user);
  const profile = useStore(s => s.profile);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (force) { setOpen(true); return; }
    // Decide whether to auto-show: never seen before
    const seenLocal = typeof window !== "undefined" && localStorage.getItem("mondial26.onboarded") === "yes";
    const seenProfile = !!profile?.onboardedAt;
    if (!seenLocal && !seenProfile) setOpen(true);
  }, [force, profile?.onboardedAt]);

  async function dismiss() {
    setOpen(false);
    localStorage.setItem("mondial26.onboarded", "yes");
    if (user) {
      try { await setUserDoc(`profiles/${user.uid}`, { onboardedAt: Date.now() }); } catch {}
    }
    onClose?.();
  }

  if (!open) return null;

  const slide = SLIDES[idx];
  const isLast = idx === SLIDES.length - 1;

  return (
    <div className="onb-overlay" role="dialog" aria-modal="true" aria-label="הדרכת שימוש">
      <div className="onb-card">
        <button className="onb-skip" onClick={dismiss}>דלג ✕</button>

        <div className="onb-emoji">{slide.emoji}</div>
        <h2 className="onb-title">{slide.title}</h2>
        <p className="onb-body">{slide.body}</p>
        {slide.highlight && <div className="onb-highlight">{slide.highlight}</div>}

        <div className="onb-dots">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              className={`onb-dot ${i === idx ? "on" : ""}`}
              onClick={() => setIdx(i)}
              aria-label={`שקופית ${i + 1}`}
            />
          ))}
        </div>

        <div className="onb-actions">
          <button
            className="btn"
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={idx === 0}
          >
            ← הקודם
          </button>
          {isLast ? (
            <button className="btn btn-primary" onClick={dismiss}>בוא נתחיל! ⚽</button>
          ) : (
            <button className="btn btn-primary" onClick={() => setIdx(i => i + 1)}>הבא →</button>
          )}
        </div>

        <div className="onb-progress">
          <div className="onb-progress-fill" style={{ width: `${((idx + 1) / SLIDES.length) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
