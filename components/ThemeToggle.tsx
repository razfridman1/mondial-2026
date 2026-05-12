"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { setUserDoc } from "@/lib/firebase";

export type Theme = "dark" | "light";

/* Resolution priority:
 *   1. localStorage value (this device's last manual pick)
 *   2. User profile in Firestore (synced across devices)
 *   3. OS prefers-color-scheme
 *   4. dark (final fallback) */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const ls = localStorage.getItem("mondial26.theme") as Theme | null;
  if (ls === "dark" || ls === "light") return ls;
  if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

export default function ThemeToggle() {
  const user = useStore(s => s.user);
  const profile = useStore(s => s.profile);
  const [theme, setTheme] = useState<Theme>("dark");
  const [hydrated, setHydrated] = useState(false);

  /* Initial mount: read from localStorage / OS */
  useEffect(() => {
    const t = getStoredTheme();
    setTheme(t);
    applyTheme(t);
    setHydrated(true);
  }, []);

  /* After auth — if profile has a saved theme and it's different, switch to it (cross-device sync). */
  useEffect(() => {
    if (!hydrated || !profile) return;
    const remote = (profile as any).theme as Theme | undefined;
    if (remote && (remote === "dark" || remote === "light") && remote !== theme) {
      setTheme(remote);
      applyTheme(remote);
      localStorage.setItem("mondial26.theme", remote);
    }
  }, [hydrated, profile]);

  async function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    localStorage.setItem("mondial26.theme", next);
    /* Persist to Firestore so other devices follow */
    if (user) {
      try { await setUserDoc(`profiles/${user.uid}`, { theme: next }); } catch {}
    }
  }

  return (
    <button className="btn btn-small" onClick={toggle} title={theme === "dark" ? "מצב בהיר" : "מצב כהה"}
            aria-label="החלף ערכת נושא">
      {theme === "dark" ? "☀️ בהיר" : "🌙 כהה"}
    </button>
  );
}
