"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";
import { AvatarDisplay } from "./AvatarPicker";
import AvatarPicker from "./AvatarPicker";

type Tab = "schedule" | "mypredictions" | "ranking" | "broadcasts" | "teams" | "bracket" | "ai" | "profile" | "admin" | "simulation" | "superadmin";

const ALL_TABS: { id: Tab; label: string; adminOnly?: boolean }[] = [
  { id: "schedule",      label: "📋 לוח משחקים" },
  { id: "mypredictions", label: "🔮 הניחושים שלי" },
  { id: "ranking",       label: "🏆 דירוג חברים" },
  { id: "broadcasts",    label: "📺 שידורים בישראל" },
  { id: "teams",         label: "🌍 קבוצות ושחקנים" },
  { id: "bracket",       label: "🏆 שלב הנוקאאוט" },
  { id: "ai",            label: "🤖 AI" },
  { id: "profile",       label: "👤 פרופיל" },
  { id: "admin",         label: "👥 ניהול משתמשים", adminOnly: true },
  { id: "simulation",    label: "🧪 ניהול סימולציה", adminOnly: true },
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

  return (
    <header className="header">
      <div className="header-top">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logo.svg" alt="מונדיאל 2026" className="brand-logo-img" />
          <div>
            <div className="brand-title">מונדיאל 2026</div>
            <div className="brand-sub">לוח משחקים · שידורים בישראל · קנדה · מקסיקו · ארה״ב</div>
          </div>
        </div>
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
              <span className="chip">{profile?.displayName || user.email}</span>
              <button className="btn btn-small" onClick={signOut}>יציאה</button>
            </>
          ) : (
            <Link className="btn btn-small btn-primary" href="/login">כניסה</Link>
          )}
        </div>
      </div>
      {pickingAvatar && <AvatarPicker onClose={() => setPickingAvatar(false)} />}
      <nav className="tabs">
        {ALL_TABS.filter(t => !t.adminOnly || user?.isAdmin).map(t => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? "on" : ""}`}
            onClick={() => setPref("tab", t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
