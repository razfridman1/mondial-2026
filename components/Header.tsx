"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";
import { shareToWhatsApp } from "@/lib/share";
import { getFirebase } from "@/lib/firebase";
import { AvatarDisplay } from "./AvatarPicker";
import AvatarPicker from "./AvatarPicker";
import FifaNewsTicker from "./FifaNewsTicker";

type Tab = "schedule" | "weekpredictions" | "openpredictions" | "mypredictions" | "topscorers" | "ranking" | "friendspredictions" | "standings" | "broadcasts" | "teams" | "myteams" | "bracket" | "mygroups" | "ai" | "profile" | "admin" | "simulation" | "superadmin" | "matchlist" | "fifapull";

/* "הקבוצות שלי" was removed as its own tab — group management now lives
 * inside "דירוג חברים" (per-group dropdown). The nav is a flat tab list. */
const NAV: { id: Tab; label: string; adminOnly?: boolean; hideOnMobile?: boolean }[] = [
  { id: "schedule",         label: "⚽ משחקים" },
  { id: "weekpredictions",  label: "📅 ניחושי השבוע" },
  { id: "openpredictions", label: "✏️ ניחושים פתוחים" },
  { id: "ranking",          label: "🏆 דירוג חברים" },
  { id: "friendspredictions", label: "🔮 ניחושי חברים" },
  { id: "mypredictions",    label: "🔮 הניחושים שלי" },
  { id: "topscorers",    label: "⚽🎯 מלך השערים והבישולים" },
  // { id: "standings",     label: "📊 טבלאות",        hideOnMobile: true },
  { id: "bracket",       label: "🏆 שלב הנוקאאוט" },
  /* Profile tab removed from nav — accessed via username click in header */
  { id: "matchlist",     label: "📋 רשימת משחקים",  adminOnly: true },
  { id: "fifapull",      label: "🌐 FIFA נתונים",    adminOnly: true },
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
  const [loginStats, setLoginStats] = useState<{ total: number; today: number } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => clearInterval(id);
  }, []);

  /* Admin-only: live "logins" counter shown right next to the profile
   * name in the header (excludes the admin's own logins — see
   * /api/auth/log-login + /api/admin/login-stats). Always shows at
   * least 0/0 immediately. */
  useEffect(() => {
    if (!user?.isAdmin) { setLoginStats(null); return; }
    setLoginStats({ total: 0, today: 0 });
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const fb = getFirebase();
          const tok = fb.auth?.currentUser ? await fb.auth.currentUser.getIdToken() : null;
          if (!tok) { await new Promise(res => setTimeout(res, 300)); continue; }
          const r = await fetch("/api/admin/login-stats", { headers: { authorization: `Bearer ${tok}` } });
          if (r.ok) {
            const j = await r.json();
            if (!cancelled) setLoginStats({ total: j.total ?? 0, today: j.today ?? 0 });
          }
          return;
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [user?.isAdmin]);

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
    const MOBILE_HIDDEN_TABS: Tab[] = ["standings"];
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
            "⚠️ חשוב: כדי לא להתבקש סיסמה בכל כניסה — פִּתחו את הקישור בדפדפן (Chrome/Safari), לחצו על תפריט (⋮) ובחרו \"הוסף למסך הבית\". כך תישארו מחוברים תמיד."
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
              {user.isAdmin && loginStats && (
                <span className="chip chip-strong header-login-stats" title="כניסות משתמשים (לא כולל אותך)">
                  📈 {loginStats.today} היום · {loginStats.total} סה״כ
                </span>
              )}
              <button className="btn btn-small" onClick={signOut}>יציאה</button>
            </>
          ) : (
            <Link className="btn btn-small btn-primary" href="/login">כניסה</Link>
          )}
        </div>
      </div>
      {pickingAvatar && <AvatarPicker onClose={() => setPickingAvatar(false)} />}
      <FifaNewsTicker />
      <nav className="tabs">
        {NAV.filter(t => !t.adminOnly || user?.isAdmin).map(t => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? "on" : ""} ${t.hideOnMobile ? "tab-hide-mobile" : ""}`}
            onClick={() => {
              setPref("tab", t.id);
              /* Switching tabs doesn't navigate (SPA), so the previous
               * scroll position carries over — e.g. leaving "משחקים"
               * scrolled down to today's matches would land on
               * "דירוג חברים" already scrolled past the leaderboard
               * table, showing the per-match predictions list first.
               * Reset to top on every tab switch so each tab opens at
               * its natural starting point. */
              if (typeof window !== "undefined") {
                window.scrollTo({ top: 0, behavior: "auto" });
              }
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
