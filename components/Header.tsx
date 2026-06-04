"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";
import { shareToWhatsApp } from "@/lib/share";
import { AvatarDisplay } from "./AvatarPicker";
import AvatarPicker from "./AvatarPicker";

type Tab = "schedule" | "mypredictions" | "ranking" | "standings" | "broadcasts" | "teams" | "myteams" | "bracket" | "mygroups" | "ai" | "profile" | "admin" | "simulation" | "superadmin";

/* "הקבוצות שלי" was removed as its own tab — group management now lives
 * inside "דירוג חברים" (per-group dropdown). The nav is a flat tab list. */
const NAV: { id: Tab; label: string; adminOnly?: boolean; hideOnMobile?: boolean }[] = [
  { id: "schedule",      label: "⚽ משחקים" },
  { id: "ranking",       label: "🏆 דירוג חברים" },
  { id: "mypredictions", label: "🔮 הניחושים שלי" },
  { id: "standings",     label: "📊 טבלאות",        hideOnMobile: true },
  { id: "bracket",       label: "🏆 שלב הנוקאאוט",  hideOnMobile: true },
  { id: "myteams",       label: "⭐ הנבחרות שלי",   hideOnMobile: true },
  /* Profile tab removed from nav — accessed via username click in header */
  { id: "admin",         label: "👥 ניהול משתמשים", adminOnly: true },
  { id: "simulation",    label: "🎲 ניהול ניחושים", adminOnly: true },
  { id: "superadmin",    label: "🛡️ שליטה מלאה",    adminOnly: true },
];

export default function Header() {
  const tab = useStore(s => s.prefs.tab);
  const setPref = useStore(s => s.setPref);
  const user = useStore(s => s.user);
  const profile = useStore(s => s.profile);
  const signOut = useStore(s => s.signOut);
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [now, setNow] = useState(() => new Date().toISOString());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => clearInterval(id);
  }, []);

  /* Legacy guard: removed tabs auto-reset. "mygroups" merged into "ranking". */
  useEffect(() => {
    if ((tab as string) === "mygroups") {
      setPref("tab", "ranking");
    } else if ((tab as string) === "broadcasts" || (tab as string) === "ai" || (tab as string) === "teams") {
      setPref("tab", "schedule");
    }
  }, [tab, setPref]);

  /* If user is on a mobile-hidden tab while on mobile, redirect to schedule.
   * Also re-check when the window resizes (e.g. rotating phone). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const MOBILE_HIDDEN_TABS: Tab[] = ["standings", "bracket", "myteams"];
    const mq = window.matchMedia("(max-width: 720px)");
    const check = () => {
      if (mq.matches && MOBILE_HIDDEN_TABS.includes(tab as Tab)) {
        setPref("tab", "schedule");
      }
    };
    check();
    mq.addEventListener("change", check);
    return () => mq.removeEventListener("change", check);
  }, [tab, setPref]);

  return (
    <header className="header">
      <div className="header-top">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logo.svg" alt="מונדיאל 2026" className="brand-logo-img" />
          <div>
            <div className="brand-title">מונדיאל 2026</div>
            <div className="brand-sub">לוח משחקים · ניחושים · דירוג חברים · קנדה · מקסיקו · ארה״ב</div>
          </div>
        </div>
        <button
          type="button"
          className="header-domain"
          title="שתף את האתר בווטסאפ"
          onClick={() => shareToWhatsApp(
            "🏆 הצטרף לאפליקציית מונדיאל 2026!\n" +
            "ניחושים, דירוג חברים, ולוח תוצאות חי ⚽\n\n" +
            "https://www.fc26.co.il\n\n" +
            "📲 טיפ: פִּתחו בדפדפן (Chrome/Safari) → תפריט → \"הוסף למסך הבית\". כך תישארו מחוברים ולא תתבקשו סיסמה שוב."
          )}
        >
          WWW.FC26.CO.IL
        </button>
        <div id="header-clock">
          <span>🕒 {formatIsraelTime(now)}</span>
          <span className="muted">{formatIsraelDate(now, { short: true })}</span>
          {user ? (
            <>
              <button
                className="header-avatar"
                onClick={() => setPickingAvatar(true)}
                title="שנה אווטר"
                aria-label="שנה אווטר"
              >
                <AvatarDisplay avatarId={profile?.avatarId || "messi"} size={36} />
              </button>
              <button
                className="chip header-name-btn"
                onClick={() => setPref("tab", "profile")}
                title="פתח פרופיל"
                aria-label="פתח פרופיל"
              >
                {profile?.displayName || user.email}
              </button>
              <button className="btn btn-small" onClick={signOut}>יציאה</button>
            </>
          ) : (
            <Link className="btn btn-small btn-primary" href="/login">כניסה</Link>
          )}
        </div>
      </div>
      {pickingAvatar && <AvatarPicker onClose={() => setPickingAvatar(false)} />}
      <nav className="tabs">
        {NAV.filter(t => !t.adminOnly || user?.isAdmin).map(t => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? "on" : ""} ${t.hideOnMobile ? "tab-hide-mobile" : ""}`}
            onClick={() => setPref("tab", t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
