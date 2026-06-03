"use client";
/* =====================================================================
 * MyTeamsTab — "הנבחרות שלי" (web only). Track national teams (synced to
 * Firestore via profile.trackedTeams) and see a full dossier for each:
 * squad by position, coach, expected lineups per upcoming match, results
 * so far, and current tournament status. Includes a non-saved search to
 * look up any team's dossier on demand.
 * ===================================================================*/
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { TEAMS } from "@/lib/data";
import { resolveAllStages } from "@/lib/bracket";
import type { MatchResult, ResolvedBracket } from "@/lib/standings";
import type { Team } from "@/lib/types";
import TeamDossier from "./TeamDossier";

const ALL_TEAMS: Team[] = Object.values(TEAMS).sort((a, b) =>
  a.name.localeCompare(b.name, "he")
);

function matchTeam(t: Team, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    t.name.includes(q.trim()) ||
    t.nameEn.toLowerCase().includes(s) ||
    t.code.toLowerCase().includes(s)
  );
}

export default function MyTeamsTab() {
  const user           = useStore(s => s.user);
  const profile        = useStore(s => s.profile);
  const addTrackedTeam = useStore(s => s.addTrackedTeam);
  const removeTrackedTeam = useStore(s => s.removeTrackedTeam);

  const [results, setResults] = useState<Record<string, MatchResult>>({});

  /* Live results — same source as the standings tab. */
  async function load() {
    try {
      const r = await fetch("/api/match-results");
      if (r.ok) setResults(await r.json());
    } catch {}
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  const resolved: ResolvedBracket = useMemo(() => resolveAllStages(results), [results]);

  const tracked = useMemo(() => {
    const codes = profile?.trackedTeams || [];
    return codes.map(c => TEAMS[c]).filter(Boolean) as Team[];
  }, [profile?.trackedTeams]);

  const trackedSet = useMemo(() => new Set(tracked.map(t => t.code)), [tracked]);

  if (!user) {
    return (
      <section className="empty-state" style={{ textAlign: "center", padding: 40 }}>
        <h3>⭐ הנבחרות שלי</h3>
        <p className="muted">היכנס כדי לעקוב אחר נבחרות ולראות סגל, מאמן, הרכבים, תוצאות ומצב במונדיאל.</p>
        <Link className="btn btn-primary" href="/login">כניסה</Link>
      </section>
    );
  }

  return (
    <section className="myteams-tab">
      <h2 className="sec-title">⭐ הנבחרות שלי</h2>
      <p className="muted" style={{ marginTop: 4, marginBottom: 16, fontSize: 13 }}>
        בחר נבחרות למעקב וקבל עליהן את כל המידע: סגל לפי מיקומים, מאמן, הרכב צפוי לכל משחק,
        התוצאות עד כה, והמצב הנוכחי בטורניר. המעקב נשמר לחשבון שלך.
      </p>

      <AddTeamPicker
        excluded={trackedSet}
        onAdd={code => addTrackedTeam(code)}
      />

      {tracked.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 16 }}>
          עדיין לא עוקב אחר אף נבחרת. הוסף נבחרת מהבורר למעלה כדי להתחיל.
        </div>
      ) : (
        <div className="myteams-list">
          {tracked.map(t => (
            <TeamDossier
              key={t.code}
              team={t}
              results={results}
              resolved={resolved}
              headerAction={
                <button
                  className="btn btn-small btn-danger"
                  onClick={() => removeTrackedTeam(t.code)}
                  title="הסר נבחרת מהמעקב"
                >
                  ✕ הסר ממעקב
                </button>
              }
            />
          ))}
        </div>
      )}

      {/* Non-saved lookup */}
      <h3 className="sec-title" style={{ marginTop: 28 }}>🔍 חיפוש נבחרת</h3>
      <p className="muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 10 }}>
        חפש כל נבחרת לצפייה מהירה בכל הפרטים — מבלי לשמור אותה למעקב.
      </p>
      <SearchLookup
        results={results}
        resolved={resolved}
        isTracked={code => trackedSet.has(code)}
        onTrack={code => addTrackedTeam(code)}
      />
    </section>
  );
}

/* ---------- Add-to-tracking searchable picker ---------- */
function AddTeamPicker({
  excluded, onAdd,
}: {
  excluded: Set<string>;
  onAdd: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const options = useMemo(
    () => ALL_TEAMS.filter(t => !excluded.has(t.code) && matchTeam(t, q)),
    [excluded, q]
  );

  return (
    <div className="myteams-picker" ref={ref}>
      <button className="btn btn-primary" onClick={() => setOpen(o => !o)}>
        ➕ הוסף נבחרת למעקב ▾
      </button>
      {open && (
        <div className="myteams-picker-menu">
          <input
            className="myteams-picker-input"
            autoFocus
            placeholder="חפש נבחרת…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <div className="myteams-picker-list">
            {options.length === 0 ? (
              <div className="muted" style={{ padding: 10, fontSize: 13 }}>אין תוצאות.</div>
            ) : (
              options.map(t => (
                <button
                  key={t.code}
                  className="myteams-picker-opt"
                  onClick={() => { onAdd(t.code); setOpen(false); setQ(""); }}
                >
                  <span className="flag">{t.flag}</span>
                  <span>{t.name}</span>
                  <span className="muted" style={{ fontSize: 11 }}>בית {t.group}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Non-saved search lookup ---------- */
function SearchLookup({
  results, resolved, isTracked, onTrack,
}: {
  results: Record<string, MatchResult>;
  resolved: ResolvedBracket;
  isTracked: (code: string) => boolean;
  onTrack: (code: string) => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Team | null>(null);

  const options = useMemo(
    () => (q.trim() ? ALL_TEAMS.filter(t => matchTeam(t, q)).slice(0, 8) : []),
    [q]
  );

  return (
    <div className="myteams-search">
      <input
        className="myteams-search-input"
        placeholder="הקלד שם נבחרת (עברית/אנגלית)…"
        value={q}
        onChange={e => { setQ(e.target.value); setSelected(null); }}
      />
      {q.trim() && !selected && (
        <div className="myteams-search-results">
          {options.length === 0 ? (
            <div className="muted" style={{ padding: 10, fontSize: 13 }}>לא נמצאה נבחרת.</div>
          ) : (
            options.map(t => (
              <button
                key={t.code}
                className="myteams-search-opt"
                onClick={() => setSelected(t)}
              >
                <span className="flag">{t.flag}</span>
                <span>{t.name}</span>
                <span className="muted" style={{ fontSize: 11 }}>· {t.nameEn} · בית {t.group}</span>
              </button>
            ))
          )}
        </div>
      )}

      {selected && (
        <div style={{ marginTop: 12 }}>
          <TeamDossier
            team={selected}
            results={results}
            resolved={resolved}
            headerAction={
              isTracked(selected.code) ? (
                <span className="chip chip-soft">✓ במעקב</span>
              ) : (
                <button
                  className="btn btn-small btn-primary"
                  onClick={() => onTrack(selected.code)}
                >
                  ➕ הוסף למעקב
                </button>
              )
            }
          />
        </div>
      )}
    </div>
  );
}
