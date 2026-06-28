"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";

async function adminAuthHeaders() {
  const token = await getFirebase().auth!.currentUser!.getIdToken();
  return { "content-type": "application/json", authorization: `Bearer ${token}` };
}

type PullType = "scorers" | "assists" | "fixtures";

function StandingsView({ data }: { data: any[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.map((group: any) => (
        <div key={group.group}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, color: "var(--accent)" }}>
            קבוצה {group.group}
          </div>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th style={{ textAlign: "left", padding: "2px 4px" }}>#</th>
                <th style={{ textAlign: "left", padding: "2px 4px" }}>קבוצה</th>
                <th style={{ padding: "2px 4px" }}>מ</th>
                <th style={{ padding: "2px 4px" }}>נ</th>
                <th style={{ padding: "2px 4px" }}>ת</th>
                <th style={{ padding: "2px 4px" }}>ה</th>
                <th style={{ padding: "2px 4px" }}>+/-</th>
                <th style={{ padding: "2px 4px", fontWeight: 700 }}>נק</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((r: any, i: number) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "2px 4px", color: "var(--text-muted)" }}>{r.rank}</td>
                  <td style={{ padding: "2px 4px" }}>{r.teamId}</td>
                  <td style={{ padding: "2px 4px", textAlign: "center" }}>{r.gp}</td>
                  <td style={{ padding: "2px 4px", textAlign: "center" }}>{r.w}</td>
                  <td style={{ padding: "2px 4px", textAlign: "center" }}>{r.d}</td>
                  <td style={{ padding: "2px 4px", textAlign: "center" }}>{r.l}</td>
                  <td style={{ padding: "2px 4px", textAlign: "center" }}>{r.gd}</td>
                  <td style={{ padding: "2px 4px", textAlign: "center", fontWeight: 700 }}>{r.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function FixturesView({ data }: { data: any[] }) {
  return (
    <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "var(--text-muted)" }}>
          <th style={{ textAlign: "left", padding: "3px 6px" }}>תאריך</th>
          <th style={{ padding: "3px 6px" }}>בית</th>
          <th style={{ padding: "3px 6px" }}>תוצאה</th>
          <th style={{ padding: "3px 6px" }}>חוץ</th>
          <th style={{ textAlign: "left", padding: "3px 6px" }}>סטטוס</th>
        </tr>
      </thead>
      <tbody>
        {data.map((e: any) => (
          <tr key={e.id} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ padding: "3px 6px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              {new Date(e.date).toLocaleDateString("he-IL", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" })}
            </td>
            <td style={{ padding: "3px 6px", textAlign: "center", fontWeight: 600 }}>{e.homeTeam}</td>
            <td style={{ padding: "3px 6px", textAlign: "center", fontWeight: 700 }}>
              {e.homeScore !== undefined ? `${e.homeScore}–${e.awayScore}` : "vs"}
            </td>
            <td style={{ padding: "3px 6px", textAlign: "center", fontWeight: 600 }}>{e.awayTeam}</td>
            <td style={{ padding: "3px 6px", color: "var(--text-muted)", fontSize: 10 }}>{e.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ScorersView({ data, label }: { data: any[]; label: string }) {
  return (
    <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "var(--text-muted)" }}>
          <th style={{ textAlign: "left", padding: "3px 6px" }}>#</th>
          <th style={{ textAlign: "left", padding: "3px 6px" }}>שחקן</th>
          <th style={{ padding: "3px 6px" }}>קבוצה</th>
          <th style={{ padding: "3px 6px", fontWeight: 700 }}>{label}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r: any, i: number) => (
          <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ padding: "3px 6px", color: "var(--text-muted)" }}>{r.rank ?? i + 1}</td>
            <td style={{ padding: "3px 6px" }}>{r.name}</td>
            <td style={{ padding: "3px 6px", textAlign: "center" }}>{r.team}</td>
            <td style={{ padding: "3px 6px", textAlign: "center", fontWeight: 700 }}>{r.displayValue ?? r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PullSection({ k, label, children, onPull, busy, error, hasData }:
  { k: PullType; label: string; children?: React.ReactNode;
    onPull: () => void; busy: boolean; error: string; hasData: boolean }) {
  return (
    <div style={{ background: "var(--bg-elev)", borderRadius: 14, padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <strong style={{ fontSize: 20, fontWeight: 800 }}>{label}</strong>
        <button className="btn btn-primary" onClick={onPull} disabled={busy}
                style={{ fontSize: 15, padding: "8px 20px" }}>
          {busy ? "⏳ מושך..." : "↓ משוך"}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 14, color: "var(--red)", background: "rgba(239,68,68,0.1)",
                      borderRadius: 8, padding: "10px 16px", marginBottom: 10 }}>
          ⚠️ {error}
        </div>
      )}

      {!hasData && !busy && !error && (
        <p className="muted" style={{ fontSize: 14, margin: 0 }}>לחץ "משוך" לטעינת נתונים.</p>
      )}

      {hasData && <div>{children}</div>}
    </div>
  );
}

export default function FifaPullTab() {
  const user = useStore(s => s.user);
  const [scorers, setScorers] = useState<any[]>([]);
  const [assists, setAssists] = useState<any[]>([]);
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!user?.isAdmin) return (
    <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
      🔒 גישה לאדמין בלבד
    </div>
  );

  async function pull(type: PullType) {
    setBusy(b => ({ ...b, [type]: true }));
    setErrors(e => ({ ...e, [type]: "" }));
    try {
      const res = await fetch(`/api/admin/fifa-pull?type=${type}`, { headers: await adminAuthHeaders() });
      const json = await res.json();
      if (json.ok) {
        if (type === "scorers")   setScorers(json.rows || []);
        if (type === "assists")   setAssists(json.rows || []);
        if (type === "fixtures")  setFixtures(json.rows || []);
      } else {
        setErrors(e => ({ ...e, [type]: json.error || "שגיאה" }));
      }
    } catch (err: any) {
      setErrors(e => ({ ...e, [type]: err.message }));
    } finally {
      setBusy(b => ({ ...b, [type]: false }));
    }
  }

  return (
    <section style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🌐 ESPN / FIFA — נתונים חיים</h2>
        <p className="muted" style={{ fontSize: 13 }}>נתונים מ-ESPN API (ציבורי, ללא מפתח)</p>
      </div>

      <PullSection k="scorers" label="⚽ מלך השערים"
        onPull={() => pull("scorers")} busy={!!busy.scorers}
        error={errors.scorers || ""} hasData={scorers.length > 0}>
        <ScorersView data={scorers} label="שערים" />
      </PullSection>

      <PullSection k="assists" label="🎯 מלך הבישולים"
        onPull={() => pull("assists")} busy={!!busy.assists}
        error={errors.assists || ""} hasData={assists.length > 0}>
        <ScorersView data={assists} label="בישולים" />
      </PullSection>

      <PullSection k="fixtures" label="📅 לוח משחקים"
        onPull={() => pull("fixtures")} busy={!!busy.fixtures}
        error={errors.fixtures || ""} hasData={fixtures.length > 0}>
        <FixturesView data={fixtures} />
      </PullSection>
    </section>
  );
}
