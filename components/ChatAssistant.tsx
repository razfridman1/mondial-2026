"use client";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";

const SUGGESTIONS = [
  "מי הם הכוכבים הגדולים של ארגנטינה?",
  "ספר לי על הסטטיסטיקה של ברזיל במונדיאל",
  "מה הסיכוי של ישראל להעפיל בעתיד?",
  "השווה בין מסי לרונאלדו",
  "איזה שחקן הבקיע הכי הרבה במונדיאלים?",
  "מי הקבוצה החזקה ביותר ב-2026?",
];

export default function ChatAssistant() {
  const user = useStore(s => s.user);
  const profile = useStore(s => s.profile);
  const aiBlocked = !!profile?.aiBlocked;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "שלום! 👋 אני הצ׳אט-בוט של מונדיאל 2026. שאל אותי על קבוצות, שחקנים, סטטיסטיקות, או על המונדיאל. במה אעזור?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    if (!user) {
      setMessages(m => [...m, { role: "assistant", content: "🔒 צריך להתחבר כדי להשתמש בצ׳אט." }]);
      return;
    }
    if (aiBlocked) {
      setMessages(m => [...m, { role: "assistant", content: "🚫 השימוש בכלי ה-AI נחסם עבור המשתמש שלך על-ידי מנהל המערכת." }]);
      return;
    }
    setInput("");
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setLoading(true);
    try {
      const token = await getFirebase().auth!.currentUser!.getIdToken();
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: next }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = data.message || data.error || "שגיאה בשרת הצ׳אט. נסה שוב מאוחר יותר.";
        setMessages(m => [...m, { role: "assistant", content: r.status === 403 ? `🚫 ${msg}` : `❌ ${msg}` }]);
        return;
      }
      setMessages(m => [...m, { role: "assistant", content: data.reply || "מצטער, אין לי תשובה כרגע." }]);
    } catch (e: any) {
      setMessages(m => [...m, { role: "assistant", content: "❌ שגיאה בשרת הצ׳אט. נסה שוב מאוחר יותר." }]);
    } finally { setLoading(false); }
  }

  return (
    <>
      <button
        className={`chat-fab ${open ? "on" : ""}`}
        onClick={() => setOpen(o => !o)}
        title={open ? "סגור צ׳אט" : "שאל את ה-AI"}
        aria-label="צ׳אט AI"
      >
        {open ? "✕" : "🤖"}
      </button>

      {open && (
        <div className="chat-panel" role="dialog" aria-label="צ׳אט AI">
          <header className="chat-header">
            <span style={{ fontSize: 22 }}>🤖</span>
            <h3>שאל את AI על מונדיאל 2026</h3>
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="סגור">✕</button>
          </header>

          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>{m.content}</div>
            ))}
            {loading && <div className="chat-msg assistant typing">…כותב</div>}
            <div ref={endRef} />
          </div>

          {messages.length <= 1 && !aiBlocked && user && (
            <div className="chat-suggest">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          )}

          {aiBlocked && (
            <div className="empty-state" style={{ margin: 10, padding: 12, fontSize: 13 }}>
              🚫 השימוש בכלי ה-AI נחסם עבור המשתמש שלך על-ידי מנהל המערכת.
            </div>
          )}

          <div className="chat-input-row">
            <input
              className="chat-input"
              placeholder={aiBlocked ? "השימוש בצ׳אט חסום" : "כתוב שאלה על שחקנים, קבוצות, סטטיסטיקות…"}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              disabled={loading || aiBlocked || !user}
            />
            <button className="chat-send" onClick={() => send()} disabled={loading || !input.trim() || aiBlocked || !user}>
              שלח
            </button>
          </div>
        </div>
      )}
    </>
  );
}
