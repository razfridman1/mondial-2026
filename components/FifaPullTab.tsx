"use client";
import { useState, useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";

async function adminAuthHeaders() {
  const token = await getFirebase().auth!.currentUser!.getIdToken();
  return { "content-type": "application/json", authorization: `Bearer ${token}` };
}

type PullType = "scorers" | "assists" | "fixtures" | "matchcentre";

const ISO: Record<string, string> = {
  AFG:"af",ALG:"dz",AND:"ad",ARG:"ar",ARM:"am",AUS:"au",AUT:"at",AZE:"az",
  BEL:"be",BEN:"bj",BFA:"bf",BHR:"bh",BIH:"ba",BLR:"by",BOL:"bo",BOT:"bw",BRA:"br",BUL:"bg",
  CMR:"cm",CAN:"ca",CAF:"cf",CHA:"td",CHI:"cl",CHN:"cn",CIV:"ci",COD:"cd",COG:"cg",
  COL:"co",COM:"km",CRC:"cr",CRO:"hr",CUB:"cu",CUW:"cw",CYP:"cy",CZE:"cz",
  DEN:"dk",DJI:"dj",DOM:"do",ECU:"ec",EGY:"eg",ENG:"gb-eng",EQG:"gq",ERI:"er",ESP:"es",EST:"ee",
  ETH:"et",FIJ:"fj",FIN:"fi",FRA:"fr",GAB:"ga",GAM:"gm",GEO:"ge",GER:"de",GHA:"gh",
  GRE:"gr",GUA:"gt",GUI:"gn",GUY:"gy",HAI:"ht",HON:"hn",HUN:"hu",
  IDN:"id",IND:"in",IRL:"ie",IRN:"ir",IRQ:"iq",ISL:"is",ISR:"il",ITA:"it",
  JAM:"jm",JOR:"jo",JPN:"jp",KAZ:"kz",KEN:"ke",KOR:"kr",KSA:"sa",KUW:"kw",
  LBN:"lb",LES:"ls",LBR:"lr",LBA:"ly",LIE:"li",LTU:"lt",LUX:"lu",
  MAD:"mg",MAR:"ma",MAS:"my",MDV:"mv",MEX:"mx",MDA:"md",MLI:"ml",MLT:"mt",
  MNG:"mn",MNE:"me",MOZ:"mz",MTN:"mr",MRI:"mu",MWI:"mw",MYA:"mm",
  NAM:"na",NCA:"ni",NED:"nl",NEP:"np",NGA:"ng",NIG:"ne",NOR:"no",NZL:"nz",
  OMA:"om",PAK:"pk",PAN:"pa",PAR:"py",PER:"pe",PHI:"ph",POL:"pl",POR:"pt",QAT:"qa",
  ROU:"ro",RSA:"za",RUS:"ru",RWA:"rw",SCO:"gb-sct",SEN:"sn",
  SLE:"sl",SLO:"si",SVN:"si",SIN:"sg",SRB:"rs",SRI:"lk",SUD:"sd",SUI:"ch",SWE:"se",
  SYR:"sy",TAN:"tz",THA:"th",TLS:"tl",TOG:"tg",TRI:"tt",TUN:"tn",TUR:"tr",
  UGA:"ug",UKR:"ua",UAE:"ae",URU:"uy",USA:"us",UZB:"uz",VEN:"ve",VIE:"vn",
  WAL:"gb-wls",YEM:"ye",ZAM:"zm",ZIM:"zw",SVK:"sk",MKD:"mk",
};

const HEB: Record<string, string> = {
  ARG:"ארגנטינה",AUS:"אוסטרליה",BEL:"בלגיה",BIH:"בוסניה",BRA:"ברזיל",
  CAN:"קנדה",CHI:"צ'ילה",CMR:"קמרון",COL:"קולומביה",CRC:"קוסטה ריקה",
  CRO:"קרואטיה",CZE:"צ'כיה",DEN:"דנמרק",ECU:"אקוודור",EGY:"מצרים",
  ENG:"אנגליה",ESP:"ספרד",FRA:"צרפת",GER:"גרמניה",GHA:"גאנה",
  HON:"הונדורס",HUN:"הונגריה",IRN:"איראן",ITA:"איטליה",JPN:"יפן",
  KOR:"קוריאה ד",KSA:"סעודיה",MAR:"מרוקו",MEX:"מקסיקו",NED:"הולנד",
  NGA:"ניגריה",NOR:"נורווגיה",NZL:"ניו זילנד",PAR:"פרגוואי",PER:"פרו",
  POL:"פולין",POR:"פורטוגל",QAT:"קטר",RSA:"דר''א",SCO:"סקוטלנד",
  SEN:"סנגל",SRB:"סרביה",SUI:"שווייץ",SVK:"סלובקיה",SWE:"שוודיה",
  TUN:"תוניסיה",TUR:"טורקיה",UKR:"אוקראינה",URU:"אורוגוואי",
  USA:"ארה''ב",WAL:"וויילס",CIV:"חוף השנהב",ALG:"אלג'יריה",
  BOL:"בוליביה",GUA:"גואטמלה",PAN:"פנמה",SLO:"סלובניה",HAI:"האיטי",
  TRI:"טרינידד",CUW:"קוראסאו",MLI:"מאלי",JOR:"ירדן",
};

function FlagImg({ code }: { code: string }) {
  const iso = ISO[code];
  if (!iso) return <span style={{ fontSize: 10, opacity: 0.5 }}>{code}</span>;
  return (
    <img
      src={"https://flagcdn.com/20x15/" + iso + ".png"}
      width={20} height={15}
      style={{ verticalAlign: "middle", borderRadius: 2, marginLeft: 4 }}
      alt={code}
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

function teamName(code: string) { return HEB[code] || code; }

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric", timeZone: "UTC" });
}

function ScorersView({ data, label }: { data: any[]; label: string }) {
  return (
    <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "var(--text-muted)" }}>
          <th style={{ textAlign: "right", padding: "4px 8px" }}>#</th>
          <th style={{ textAlign: "right", padding: "4px 8px" }}>שחקן</th>
          <th style={{ textAlign: "right", padding: "4px 8px" }}>קבוצה</th>
          <th style={{ padding: "4px 8px", fontWeight: 700 }}>{label}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r: any, i: number) => (
          <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ padding: "4px 8px", color: "var(--text-muted)", textAlign: "right" }}>{r.rank ?? i + 1}</td>
            <td style={{ padding: "4px 8px", textAlign: "right" }}>{r.name}</td>
            <td style={{ padding: "4px 8px", textAlign: "right" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {teamName(r.teamCode || r.team)}
                <FlagImg code={r.teamCode || r.team} />
              </span>
            </td>
            <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 700 }}>{r.count ?? r.value ?? r.displayValue}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MatchResultsView({ data }: { data: any[] }) {
  if (!data.length) return <p className="muted" style={{ fontSize: 14 }}>אין תוצאות (הרץ: node crawl-fifa.mjs --only matchcentre)</p>;
  return (
    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "var(--text-muted)" }}>
          <th style={{ textAlign: "right", padding: "4px 8px" }}>בית</th>
          <th style={{ padding: "4px 8px" }}>תוצאה</th>
          <th style={{ textAlign: "left", padding: "4px 8px" }}>חוץ</th>
          <th style={{ padding: "4px 8px", fontSize: 11 }}>תאריך</th>
          <th style={{ padding: "4px 8px", fontSize: 11 }}>סטטוס</th>
        </tr>
      </thead>
      <tbody>
        {data.map((m: any, i: number) => (
          <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ padding: "4px 8px", fontWeight: 600, textAlign: "right" }}>
              {teamName(m.home)} <FlagImg code={m.home} />
            </td>
            <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 800, fontSize: 16 }}>
              {m.homeScore ?? "?"} - {m.awayScore ?? "?"}
            </td>
            <td style={{ padding: "4px 8px", fontWeight: 600 }}>
              <FlagImg code={m.away} /> {teamName(m.away)}
            </td>
            <td style={{ padding: "4px 8px", color: "var(--text-muted)", fontSize: 11, textAlign: "center" }}>
              {m.matchDate ? formatDate(m.matchDate) : ""}
            </td>
            <td style={{ padding: "4px 8px", color: "var(--text-muted)", fontSize: 11, textAlign: "center" }}>
              {m.date || m.status || ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FixturesView({ data }: { data: any[] }) {
  if (!data.length) return <p className="muted" style={{ fontSize: 14 }}>אין נתונים (הרץ: node crawl-fifa.mjs --only fixtures)</p>;
  return (
    <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "var(--text-muted)" }}>
          <th style={{ textAlign: "right", padding: "4px 8px" }}>בית</th>
          <th style={{ padding: "4px 8px" }}>תוצאה</th>
          <th style={{ textAlign: "left", padding: "4px 8px" }}>חוץ</th>
          <th style={{ padding: "4px 8px" }}>תאריך</th>
        </tr>
      </thead>
      <tbody>
        {data.map((e: any, i: number) => (
          <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ padding: "4px 8px", fontWeight: 600, textAlign: "right" }}>
              {teamName(e.home || e.homeTeam)} <FlagImg code={e.home || e.homeTeam} />
            </td>
            <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 700 }}>
              {e.score ?? (e.homeScore !== undefined ? e.homeScore + "-" + e.awayScore : "נגד")}
            </td>
            <td style={{ padding: "4px 8px", fontWeight: 600 }}>
              <FlagImg code={e.away || e.awayTeam} /> {teamName(e.away || e.awayTeam)}
            </td>
            <td style={{ padding: "4px 8px", color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>{e.date}</td>
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
          {busy ? "⏳ טוען..." : "↓ משוך"}
        </button>
        {updatedAt && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            עודכן: {new Date(updatedAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
        לרענון: <code>{hint}</code>
      </p>
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
  const [scorers,      setScorers]      = useState<any[]>([]);
  const [assists,      setAssists]      = useState<any[]>([]);
  const [fixtures,     setFixtures]     = useState<any[]>([]);
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [busy,         setBusy]         = useState<Record<string, boolean>>({});
  const [errors,       setErrors]       = useState<Record<string, string>>({});
  const [updated,      setUpdated]      = useState<Record<string, string>>({});
  const loaded = useRef(false);

  useEffect(() => {
    if (!user?.isAdmin || loaded.current) return;
    loaded.current = true;
    (["scorers", "assists", "fixtures", "matchcentre"] as PullType[]).forEach(t => pull(t, true));
  }, [user]);

  if (!user?.isAdmin) return (
    <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
      🔒 גישה לאדמין בלבד
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
        setErrors(e => ({ ...e, [type]: json.error || "שגיאה" }));
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
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🌐 נתוני FIFA — Crawler</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          נתונים מ-FIFA.com דרך Playwright. הרצה: <code>node crawl-fifa.mjs</code>
        </p>
      </div>

      <PullSection label="⚽ מלך השערים" hint="node crawl-fifa.mjs --only scorers"
        onPull={() => pull("scorers")} busy={!!busy.scorers}
        error={errors.scorers || ""} updatedAt={updated.scorers} hasData={scorers.length > 0}>
        <ScorersView data={scorers} label="שערים" />
      </PullSection>

      <PullSection label="🎯 מלך הבישולים" hint="node crawl-fifa.mjs --only assists"
        onPull={() => pull("assists")} busy={!!busy.assists}
        error={errors.assists || ""} updatedAt={updated.assists} hasData={assists.length > 0}>
        <ScorersView data={assists} label="בישולים" />
      </PullSection>

      <PullSection label="📅 לוח משחקים" hint="node crawl-fifa.mjs --only fixtures"
        onPull={() => pull("fixtures")} busy={!!busy.fixtures}
        error={errors.fixtures || ""} updatedAt={updated.fixtures} hasData={fixtures.length > 0}>
        <FixturesView data={fixtures} />
      </PullSection>

      <PullSection label="🏟️ תוצאות משחקים" hint="node crawl-fifa.mjs --only matchcentre"
        onPull={() => pull("matchcentre")} busy={!!busy.matchcentre}
        error={errors.matchcentre || ""} updatedAt={updated.matchcentre} hasData={matchResults.length > 0}>
        <MatchResultsView data={matchResults} />
      </PullSection>
    </section>
  );
}
