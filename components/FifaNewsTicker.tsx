"use client";
import { useEffect, useState } from "react";
import { getFifaNews } from "@/lib/fifaNews";

const ROTATE_MS = 7000;

/* Small rotating banner with curated FIFA World Cup 2026 announcements.
 * Dismissible for the current app session only — closing it just hides it
 * until the next time the app is opened/reloaded (no persistence), so
 * users see the announcements again on every fresh entry.
 *
 * The list itself (getFifaNews) is computed from the real calendar each
 * render, so "today"/"tomorrow" wording always matches the actual date
 * and items for dates that have already passed are dropped. */
export default function FifaNewsTicker() {
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const news = getFifaNews();

  useEffect(() => {
    if (dismissed || news.length <= 1) return;
    const id = setInterval(() => setIndex(i => (i + 1) % news.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [dismissed, news.length]);

  if (dismissed || news.length === 0) return null;

  function dismiss() {
    setDismissed(true);
  }

  const item = news[index % news.length];

  return (
    <div className="fifa-ticker">
      <span className="fifa-ticker-tag">📢 FIFA · מונדיאל 2026</span>
      <span className="fifa-ticker-text">{item.text}</span>
      <button className="fifa-ticker-close" onClick={dismiss} title="סגור הודעות" aria-label="סגור הודעות">✕</button>
    </div>
  );
}
