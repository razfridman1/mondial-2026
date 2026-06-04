"use client";
/* =====================================================================
 * ThemeToggle — switch between dark (default) and light mode.
 * The light-mode styles already live in globals.css under
 * `html[data-theme="light"]`; this just flips the attribute and persists
 * the choice to localStorage (applied before paint by the inline script
 * in app/layout.tsx).
 * ===================================================================*/
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const cur = document.documentElement.getAttribute("data-theme");
    setTheme(cur === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      document.documentElement.setAttribute("data-theme", next);
      document.documentElement.style.colorScheme = next;
      localStorage.setItem("theme", next);
    } catch {}
  }

  return (
    <button
      type="button"
      className="btn btn-small theme-toggle"
      onClick={toggle}
      title={theme === "dark" ? "עבור למצב בהיר" : "עבור למצב כהה"}
      aria-label={theme === "dark" ? "עבור למצב בהיר" : "עבור למצב כהה"}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
