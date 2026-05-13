"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { AvatarDisplay } from "./AvatarPicker";

interface RoastDoc {
  id: string;
  mode: "self" | "friend" | "all";
  groupId: string | null;
  targetUid?: string;
  targetName?: string;
  targetAvatarId?: string;
  targets?: { uid: string; displayName: string; avatarId: string }[];
  byUid: string;
  byName: string;
  byAvatarId: string;
  markdown: string;
  ts: number;
}

/* Floating side feed — collapsible drawer on the right edge.
 * Doesn't interfere with the page; user toggles when they want. */
export default function RoastsFeed() {
  const user = useStore(s => s.user);
  const currentGroupId = useStore(s => s.currentGroupId);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RoastDoc[]>([]);
  const [unread, setUnread] = useState(0);
  const [lastSeenTs, setLastSeenTs] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("mondial26.roastSeen") || 0);
  });

  async function load() {
    const q = currentGroupId ? `?groupId=${currentGroupId}&limit=40` : "?limit=40";
    try {
      const r = await fetch(`/api/roasts${q}`);
      if (!r.ok) return;
      const data: RoastDoc[] = await r.json();
      setItems(data);
      setUnread(data.filter(x => x.ts > lastSeenTs).length);
    } catch {}
  }

  useEffect(() => { load(); }, [currentGroupId, lastSeenTs]);
  useEffect(() => {
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [currentGroupId, lastSeenTs]);

  function toggle() {
    if (!open && items.length) {
      const newest = items[0].ts;
      localStorage.setItem("mondial26.roastSeen", String(newest));
      setLastSeenTs(newest);
      setUnread(0);
    }
    setOpen(o => !o);
  }

  return (
    <>
      <button
        className={`roasts-fab ${open ? "on" : ""}`}
        onClick={toggle}
        aria-label="פיד עקיצות"
        title={open ? "סגור פיד עקיצות" : "פתח פיד עקיצות"}
      >
        {open ? "✕" : "🃏"}
        {!open && unread > 0 && <span className="roasts-badge">{unread}</span>}
      </button>

      {open && (
        <aside className="roasts-panel" aria-label="פיד עקיצות">
          <header className="roasts-header">
            <span style={{ fontSize: 22 }}>🃏</span>
            <h3>פיד עקיצות</h3>
            <button className="chat-close" onClick={toggle} aria-label="סגור">✕</button>
          </header>

          {items.length === 0 ? (
            <div className="empty-state" style={{ margin: 12, padding: 18 }}>
              עוד אין עקיצות. לחץ "🔥 צור עקיצה" בלשונית "🤖 AI".
            </div>
          ) : (
            <div className="roasts-list">
              {items.map(r => <RoastItem key={r.id} r={r} />)}
            </div>
          )}
        </aside>
      )}
    </>
  );
}

function RoastItem({ r }: { r: RoastDoc }) {
  const time = new Date(r.ts).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const targetLabel =
    r.mode === "all"  ? `🎯 ${r.targets?.map(t => t.displayName).join(", ").slice(0, 60) || "כולם"}`
    : r.mode === "self"? `🪞 ${r.byName} (עצמי)`
    :                    `🎯 ${r.targetName}`;
  return (
    <div className="roast-item">
      <div className="roast-item-head">
        <AvatarDisplay avatarId={r.byAvatarId} size={26} />
        <div className="roast-by">
          <div className="roast-by-name">{r.byName}</div>
          <div className="muted roast-target">{targetLabel} · {time}</div>
        </div>
      </div>
      <div className="roast-item-body">{r.markdown}</div>
    </div>
  );
}
