"use client";
import { useEffect, useState } from "react";
import { getFifaNews, pickRandomFact, type FifaNewsItem } from "@/lib/fifaNews";

const ROTATE_MS = 7000;
const LAST_FACT_KEY = "fifaNewsLastFactIndex";

/* Fisher-Yates shuffle into a new array — used so the order of items (and
 * therefore the FIRST item shown) differs on every page load. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Small rotating banner with curated FIFA World Cup 2026 announcements.
 * Dismissible for the current app session only — closing it just hides it
 * until the next time the app is opened/reloaded (no persistence), so
 * users see the announcements again on every fresh entry.
 *
 * The date-based items (today's/tomorrow's matches, opening/final notices)
 * come from getFifaNews(). On top of that, every page load picks a random
 * "fact" from FACT_POOL (avoiding the one shown last time, via
 * localStorage) and shuffles the whole list — so a refresh both shows a
 * new fact and starts the rotation on a different item. */
export default function FifaNewsTicker() {
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [news, setNews] = useState<FifaNewsItem[]>([]);

  useEffect(() => {
    let lastFactIdx: number | undefined;
    try {
      const raw = localStorage.getItem(LAST_FACT_KEY);
      if (raw != null) lastFactIdx = Number(raw);
    } catch {}

    const fact = pickRandomFact(lastFactIdx);
    try {
      localStorage.setItem(LAST_FACT_KEY, fact.id.replace("fact-", ""));
    } catch {}

    setNews(shuffle([...getFifaNews(), fact]));
  }, []);

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
