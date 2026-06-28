"use client";
import { useState, useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";

async function adminAuthHeaders() {
  const token = await getFirebase().auth!.currentUser!.getIdToken();
  return { "content-type": "application/json", authorization: `Bearer ${token}` };
}

type PullType = "scorers" | "assists" | "fixtures" | "matchcentre";

function ScorersView({ data, label }: { data: any[]; label: string }) {
  return (
    <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "var(--text-muted)" }}>
          <th style={{ textAlign: "left", padding: "4px 8px" }}>#</th>
          <th style={{ textAlign: "left", padding: "4px 8px" }}>שחקן</th>
          <th style={{ padding: "4px 8px" }}>קבוצה</th>
          <th style={{ padding: "4px 8px", fontWeight: 700 }}>{label}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r: any, i: number) => (
          <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ padding: "4px 8px", color: "var(--text-muted)" }}>{r.rank ?? i + 1}</td>
            <td style={{ padding: "4px 8px" }}>{r.name}</td>
            <td style={{ padding: "4px 8px", textAlign: "center" }}>{r.teamCode || r.team}</td>
            <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 700 }}>{r.count ?? r.value ?? r.displayValue}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MatchResultsView({ data }: { data: any[] }) {
  if (!data.length) return <p className="muted" style={{ fontSize: 14 }}>אין תוצאות</p>;
  return (
    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "var(--text-muted)" }}>
          <th style={{ textAlign: "right", padding: "4px 8px" }}>בית</th>
          <th style={{ padding: "4px 8px" }}>תוצאה</th>
          <th style={{ textAlign: "left", padding: "4px 8px" }}>חוץ</th>
          <th style={{ textAlign: "left", padding: "4px 8px", fontSize: 11 }}>סטטוס</th>
        </tr>
      </thead>
      <tbody>
        {data.map((m: any, i: number) => (
          <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ padding: "4px 8px", fontWeight: 600, textAlign: "right" }}>{m.home}</td>
            <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 800, fontSize: 16 }}>
              {m.homeScore ?? "?"} - {m.awayScore ?? "?"}
            </td>
            <td style={{ padding: "4px 8px", fontWeight: 600 }}>{m.away}</td>
            <td style={{ padding: "4px 8px", color: "var(--text-muted)", fontSize: 11 }}>{m.date || m.status || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FixturesView({ data }: { data: any[] }) {
  return (
    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "var(--text-muted)" }}>
          <th style={{ textAlign: "left", padding: "4px 8px" }}>בית</th>
          <th style={{ padding: "4px 8px" }}>תוצאה</th>
          <th style={{ textAlign: "left", padding: "4px 8px" }}>חוץ</th>
          <th style={{ textAlign: "left", padding: "4px 8px" }}>תאריך</th>
        </tr>
      </thead>
      <tbody>
        {data.map((e: any, i: number) => (
          <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ padding: "4px 8px", fontWeight: 600 }}>{e.home || e.homeTeam}</td>
            <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 700 }}>
              {e.score ?? (e.homeScore !== undefined ? `${e.homeScore}-${e.awayScore}` : "vs")}
            </td>
            <td style={{ padding: "4px 8px", fontWeight: 600 }}>{e.away || e.awayTeam}</td>
            <td style={{ padding: "4px 8px", color: "var(--text-muted)", fontSize: 12 }}>{e.date}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PullSection({ label, hint, children, onPull, busy, error, updatedAt, hasData }:
  { label: string; hint: string; children?: React.ReactNode;
    onPull: () => void; busy: boolean; error: string; updatedAt?: string; hasData: boolean }) {
  return (
    <div style={{ background: "var(--bg-elev)", borderRadius: 14, padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
        <strong style={{ fontSize: 20, fontWeight: 800 }}>{label}</strong>
        <button className="btn btn-primary" onClick={onPull} disabled={busy}
                style={{ fontSize: 15, padding: "8px 20px" }}>
          {busy ? "loading..." : "pull"}
        </button>
        {updatedAt && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            updated: {new Date(updatedAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
        refresh: <code>{hint}</code>
      </p>

      {error && (
        <div style={{ fontSize: 14, color: "var(--red)", background: "rgba(239,68,68,0.1)",
                      borderRadius: 8, padding: "10px 16px", marginBottom: 10 }}>
          {error}
        </div>
      )}

      {!hasData && !busy && !error && (
        <p className="muted" style={{ fontSize: 14, margin: 0 }}>Click "pull" to load data from Firestore.</p>
      )}

      {hasData && <div>{children}</div>}
    </div>
  );
}

export default function FifaPullTab() {
  const user = useStore(s => s.user);
  const [scorers,      setScorers]      = useState<any[]>([]);
  const [assists,      setAssists]      = useState<any[]>([]);
  const [fixtures,     setFixtures]     = useState<any[]>([]);
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [busy,         setBusy]         = useState<Record<string, boolean>>({});
  const [errors,       setErrors]       = useState<Record<string, string>>({});
  const [updated,      setUpdated]      = useState<Record<string, string>>({});
  const loaded = useRef(false);

  // Auto-load all sections once on mount so data persists across tab switches
  useEffect(() => {
    if (!user?.isAdmin || loaded.current) return;
    loaded.current = true;
    (["scorers", "assists", "fixtures", "matchcentre"] as PullType[]).forEach(t => pull(t, true));
  }, [user]);

  if (!user?.isAdmin) return (
    <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
      Admin only
    </div>
  );

  async function pull(type: PullType, silent = false) {
    setBusy(b => ({ ...b, [type]: true }));
    if (!silent) setErrors(e => ({ ...e, [type]: "" }));
    try {
      const res = await fetch(`/api/admin/fifa-pull?type=${type}`, { headers: await adminAuthHeaders() });
      const json = await res.json();
      if (json.ok) {
        if (type === "scorers")      setScorers(json.rows      || []);
        if (type === "assists")      setAssists(json.rows      || []);
        if (type === "fixtures")     setFixtures(json.rows     || []);
        if (type === "matchcentre")  setMatchResults(json.rows || []);
        if (json.updatedAt) setUpdated(u => ({ ...u, [type]: json.updatedAt }));
      } else if (!silent) {
        setErrors(e => ({ ...e, [type]: json.error || "Error" }));
      }
    } catch (err: any) {
      if (!silent) setErrors(e => ({ ...e, [type]: err.message }));
    } finally {
      setBusy(b => ({ ...b, [type]: false }));
    }
  }

  return (
    <section style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>FIFA Data - Crawler</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          Data from FIFA.com via Playwright. Run: <code>node crawl-fifa.mjs</code>
        </p>
      </div>

      <PullSection label="Top Scorers" hint="node crawl-fifa.mjs --only scorers"
        onPull={() => pull("scorers")} busy={!!busy.scorers}
        error={errors.scorers || ""} updatedAt={updated.scorers} hasData={scorers.length > 0}>
        <ScorersView data={scorers} label="Goals" />
      </PullSection>

      <PullSection label="Top Assists" hint="node crawl-fifa.mjs --only assists"
        onPull={() => pull("assists")} busy={!!busy.assists}
        error={errors.assists || ""} updatedAt={updated.assists} hasData={assists.length > 0}>
        <ScorersView data={assists} label="Assists" />
      </PullSection>

      <PullSection label="Fixtures" hint="node crawl-fifa.mjs --only fixtures"
        onPull={() => pull("fixtures")} busy={!!busy.fixtures}
        error={errors.fixtures || ""} updatedAt={updated.fixtures} hasData={fixtures.length > 0}>
        <FixturesView data={fixtures} />
      </PullSection>

      <PullSection label="Match Results" hint="node crawl-fifa.mjs --only matchcentre"
        onPull={() => pull("matchcentre")} busy={!!busy.matchcentre}
        error={errors.matchcentre || ""} updatedAt={updated.matchcentre} hasData={matchResults.length > 0}>
        <MatchResultsView data={matchResults} />
      </PullSection>
    </section>
  );
}
