"use client";
import { useEffect, useState } from "react";
import { FIFA_NEWS_2026 } from "@/lib/fifaNews";

const ROTATE_MS = 7000;

/* Small rotating banner with curated FIFA World Cup 2026 announcements.
 * Dismissible for the current app session only — closing it just hides it
 * until the next time the app is opened/reloaded (no persistence), so
 * users see the announcements again on every fresh entry. */
export default function FifaNewsTicker() {
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed || FIFA_NEWS_2026.length <= 1) return;
    const id = setInterval(() => setIndex(i => (i + 1) % FIFA_NEWS_2026.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [dismissed]);

  if (dismissed || FIFA_NEWS_2026.length === 0) return null;

  function dismiss() {
    setDismissed(true);
  }

  const item = FIFA_NEWS_2026[index % FIFA_NEWS_2026.length];

  return (
    <div className="fifa-ticker">
      <span className="fifa-ticker-tag">📢 FIFA · מונדיאל 2026</span>
      <span className="fifa-ticker-text">{item.text}</span>
      <button className="fifa-ticker-close" onClick={dismiss} title="סגור הודעות" aria-label="סגור הודעות">✕</button>
    </div>
  );
}
