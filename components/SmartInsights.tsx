"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";

export default function SmartInsights() {
  const user = useStore(s => s.user);
  const currentGroupId = useStore(s => s.currentGroupId);
  const [markdown, setMarkdown] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!user) { setError("צריך להתחבר"); return; }
    setBusy(true); setError(null);
    try {
      const token = await getFirebase().auth!.currentUser!.getIdToken();
      const r = await fetch("/api/insights", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ groupId: currentGroupId || undefined }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || "שגיאה"); return; }
      setMarkdown(data.markdown || "");
    } catch (e: any) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  useEffect(() => { /* don't auto-fetch — call costs money */ }, []);

  return (
    <section className="ai-section">
      <h3>🧠 ניתוח ניחושים</h3>
      <p className="muted">בחר קבוצת חברים בלשונית "דירוג חברים" כדי לקבל ניתוח על הקבוצה. אחרת תנתח את כל המשתמשים.</p>
      <div className="mc-actions">
        <button className="btn btn-primary" onClick={generate} disabled={busy}>
          {busy ? "…מנתח" : "✨ צור ניתוח חכם"}
        </button>
      </div>
      {error && <p className="pred-msg is-locked">{error}</p>}
      {markdown && (
        <div className="insights-output" dangerouslySetInnerHTML={{ __html: markdownToHtml(markdown) }} />
      )}
    </section>
  );
}

function markdownToHtml(md: string): string {
  return md
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/\n\n/g,"</p><p>")
    .replace(/\n/g,"<br/>")
    .replace(/^(.*)$/s,"<p>$1</p>");
}
