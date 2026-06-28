"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";

async function adminAuthHeaders() {
  const token = await getFirebase().auth!.currentUser!.getIdToken();
  return { "content-type": "application/json", authorization: `Bearer ${token}` };
}

type PullType = "standings" | "scorers" | "assists" | "fixtures";

const FIFA_URLS: Record<PullType, string> = {
  standings: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/standings",
  scorers:   "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/statistics/player-statistics",
  assists:   "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/statistics/player-statistics",
  fixtures:  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures?country=IL&wtw-filter=ALL",
};

const SECTIONS: { key: PullType; label: string }[] = [
  { key: "standings", label: "🏆 טבלאות קבוצות" },
  { key: "scorers",   label: "⚽ מלך השערים" },
  { key: "assists",   label: "🎯 מלך הבישולים" },
];

function PullSection({ k, label, onData }: {
  k: PullType; label: string;
  onData: (type: PullType, rows: any[]) => void;
}) {
  const [data, setData] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pull() {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/admin/fifa-pull?type=${k}`, { headers: await adminAuthHeaders() });
      const json = await res.json();
      if (json.ok && json.rows?.length) {
        setData(json.rows);
        onData(k, json.rows);
      } else {
        setError(json.error || "שגיאה");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: "var(--bg-elev)", borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <strong style={{ fontSize: 14 }}>{label}</strong>
        <button className="btn btn-small btn-primary" onClick={pull} disabled={busy}>
          {busy ? "⏳ מושך..." : "↓ משוך"}
        </button>
        <a href={FIFA_URLS[k]} target="_blank" rel="noreferrer"
           style={{ fontSize: 11, color: "var(--accent)", marginInlineStart: "auto" }}>
          פתח ב-FIFA.com ↗
        </a>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: "var(--red)", background: "rgba(239,68,68,0.1)",
                      borderRadius: 6, padding: "8px 12px", marginBottom: 8 }}>
          ⚠️ {error}
          <br />
          <a href={FIFA_URLS[k]} target="_blank" rel="noreferrer"
             style={{ color: "var(--accent)", fontSize: 11 }}>
            לחץ כאן לפתיחה ידנית ↗
          </a>
        </div>
      )}

      {data.length > 0 && (
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all",
                        background: "var(--bg)", borderRadius: 6, padding: 10,
                        color: "var(--text-muted)", margin: 0 }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}

      {data.length === 0 && !busy && !error && (
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>לחץ "משוך" לטעינת נתונים.</p>
      )}
    </div>
  );
}

export default function FifaPullTab() {
  const user = useStore(s => s.user);
  if (!user?.isAdmin) return (
    <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
      🔒 גישה לאדמין בלבד
    </div>
  );

  function handleData(type: PullType, rows: any[]) {
    console.log(`[FIFA] ${type}:`, rows);
  }

  return (
    <section style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>🌐 FIFA — משיכת נתונים חיים</h2>
      <p className="muted" style={{ fontSize: 12, marginBottom: 20 }}>
        FIFA.com מרונדר בדפדפן בלבד — המשיכה השרת-סיידית לרוב תחזיר שגיאה.
        לחץ "פתח ב-FIFA.com" לצפייה ישירה.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        {/* Left: standings + scorers + assists */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {SECTIONS.map(({ key, label }) => (
            <PullSection key={key} k={key} label={label} onData={handleData} />
          ))}
        </div>

        {/* Right: fixtures */}
        <PullSection k="fixtures" label="📅 לוח משחקים (IL)" onData={handleData} />
      </div>
    </section>
  );
}
