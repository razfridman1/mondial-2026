"use client";
/* =====================================================================
 * MatchesTab — modern live-results center.
 * Inspired by Sofascore / Flashscore / OneFootball.
 *
 * Sections (top pills):
 *   חי   — currently live matches (pregame + live)
 *   היום — all matches today (regardless of status)
 *   קרובים — upcoming matches in next 7 days
 *   הסתיימו — finished matches (most recent first)
 *   היסטוריה — full archive with filters
 *
 * Plus filters (date / stage / team) and a Favorites star toggle to focus
 * on a few favorite national teams.
 *
 * Designed mobile-first; dark glassmorphism aesthetic.
 * ===================================================================*/
import { useEffect, useMemo, useState } from "react";
import { MATCHES, TEAMS, VENUES, STAGES, CHANNELS } from "@/lib/data";
import { useStore } from "@/lib/store";
import {
  israelDateKey, todayKey, formatIsraelDate, formatIsraelTime,
  matchLiveStatus, relativeLabel,
} from "@/lib/utils";
import { effMatch } from "@/lib/sim";
import type { Match } from "@/lib/types";
import MatchModal from "./MatchModal";

type Section = "live" | "today" | "upcoming" | "finished" | "history";

const FAV_KEY = "fav_teams_v1";

function loadFavs(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch { return []; }
}
function saveFavs(arr: string[]) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(arr)); } catch {}
}

export default function MatchesTab() {
  const overrides = useStore(s => s.overrides);
  const simConfig = useStore(s => s.simConfig);

  const [section, setSection]   = useState<Section>("today");
  const [openId, setOpenId]     = useState<string | null>(null);
  const [results, setResults]   = useState<Record<string, { home: number; away: number; finishedAt: number }>>({});
  const [favs, setFavs]         = useState<string[]>(() => loadFavs());
  const [favOnly, setFavOnly]   = useState(false);
  const [now, setNow]           = useState(() => Date.now());

  /* Filters (used in history section) */
  const [fltStage, setFltStage]  = useState<string>("");
  const [fltTeam, setFltTeam]    = useState<string>("");
  const [fltDay, setFltDay]      = useState<string>("");

  /* Live tick every 15s so live state updates */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  /* Fetch results */
  useEffect(() => {
    let on = true;
    async function load() {
      try {
        const r = await fetch("/api/match-results");
        if (r.ok && on) setResults(await r.json());
      } catch {}
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { on = false; clearInterval(id); };
  }, []);

  /* All effective matches */
  const matches = useMemo(
    () => MATCHES.map(m => effMatch(m, overrides[m.id], simConfig))
      .sort((a, b) => +new Date(a.utc) - +new Date(b.utc)),
    [overrides, simConfig]
  );

  function isFav(m: Match) {
    return favs.includes(m.home) || favs.includes(m.away);
  }
  function toggleFav(code: string) {
    setFavs(prev => {
      const next = prev.includes(code) ? prev.filter(x => x !== code) : [...prev, code];
      saveFavs(next);
      return next;
    });
  }

  /* Bucketed lists */
  const buckets = useMemo(() => {
    const today = todayKey();
    const live: Match[] = [];
    const todays: Match[] = [];
    const upcoming: Match[] = [];
    const finished: Match[] = [];

    for (const m of matches) {
      const st = matchLiveStatus(m);
      const key = israelDateKey(m.utc);
      const dayDiff = Math.round((+new Date(m.utc) - now) / (24 * 3600 * 1000));

      if (st === "live" || st === "pregame") live.push(m);
      if (key === today) todays.push(m);
      if (st === "finished") finished.push(m);
      if (st === "scheduled" && dayDiff >= 0 && dayDiff <= 7) upcoming.push(m);
    }
    /* Finished: newest first */
    finished.sort((a, b) => +new Date(b.utc) - +new Date(a.utc));
    return { live, today: todays, upcoming, finished };
  }, [matches, now]);

  /* History list with filters */
  const historyList = useMemo(() => {
    let list = matches.slice();
    if (fltStage) list = list.filter(m => m.stage === fltStage);
    if (fltTeam)  list = list.filter(m => m.home === fltTeam || m.away === fltTeam);
    if (fltDay)   list = list.filter(m => israelDateKey(m.utc) === fltDay);
    if (favOnly)  list = list.filter(isFav);
    return list;
  }, [matches, fltStage, fltTeam, fltDay, favOnly, favs]);

  /* Visible list based on section */
  const visible: Match[] = useMemo(() => {
    let list: Match[];
    switch (section) {
      case "live":     list = buckets.live; break;
      case "today":    list = buckets.today; break;
      case "upcoming": list = buckets.upcoming; break;
      case "finished": list = buckets.finished; break;
      case "history":  list = historyList; break;
      default:         list = buckets.today;
    }
    if (favOnly && section !== "history") list = list.filter(isFav);
    return list;
  }, [section, buckets, historyList, favOnly, favs]);

  const counts = {
    live: buckets.live.length,
    today: buckets.today.length,
    upcoming: buckets.upcoming.length,
    finished: buckets.finished.length,
  };

  return (
    <section className="matches-tab">
      {/* Section pills */}
      <nav className="mt-sections" role="tablist" aria-label="קטגוריות">
        <PillBtn active={section === "live"}     onClick={() => setSection("live")}
                 icon={<LiveDot />} label="חי"      badge={counts.live} highlight />
        <PillBtn active={section === "today"}    onClick={() => setSection("today")}
                 icon="📅" label="היום"   badge={counts.today} />
        <PillBtn active={section === "upcoming"} onClick={() => setSection("upcoming")}
                 icon="⏭"  label="קרובים" badge={counts.upcoming} />
        <PillBtn active={section === "finished"} onClick={() => setSection("finished")}
                 icon="🏁" label="הסתיימו" badge={counts.finished} />
        <PillBtn active={section === "history"}  onClick={() => setSection("history")}
                 icon="🗂" label="היסטוריה" />
      </nav>

      {/* Favorites bar */}
      <div className="mt-fav-bar">
        <button className={`mt-fav-toggle ${favOnly ? "on" : ""}`}
                onClick={() => setFavOnly(v => !v)} title="הצג רק מועדפים">
          {favOnly ? "★" : "☆"} מועדפים בלבד
        </button>
        {favs.length > 0 && (
          <div className="mt-fav-list" aria-label="קבוצות מועדפות">
            {favs.map(code => {
              const t = TEAMS[code]; if (!t) return null;
              return (
                <button key={code} className="mt-fav-chip" onClick={() => toggleFav(code)} title="הסר מהמועדפים">
                  <span>{t.flag}</span><span>{t.name}</span><span aria-hidden>×</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* History filters */}
      {section === "history" && <HistoryFilters
        stage={fltStage} setStage={setFltStage}
        team={fltTeam}   setTeam={setFltTeam}
        day={fltDay}     setDay={setFltDay}
        matches={matches}
      />}

      {/* List body */}
      <div className="mt-body">
        {visible.length === 0
          ? <EmptyState section={section} />
          : <GroupedList list={visible} section={section} results={results}
                         onOpen={setOpenId} isFav={isFav} onToggleFav={toggleFav} />}
      </div>

      {openId && <MatchModal matchId={openId} onClose={() => setOpenId(null)} />}
    </section>
  );
}

/* -------------------------- sub-components ------------------------- */

function PillBtn({ active, onClick, icon, label, badge, highlight }: {
  active: boolean; onClick: () => void;
  icon: React.ReactNode; label: string; badge?: number; highlight?: boolean;
}) {
  return (
    <button role="tab" aria-selected={active}
            className={`mt-pill ${active ? "on" : ""} ${highlight ? "is-live" : ""}`}
            onClick={onClick}>
      <span className="mt-pill-icon" aria-hidden>{icon}</span>
      <span className="mt-pill-label">{label}</span>
      {typeof badge === "number" && badge > 0 && <span className="mt-pill-badge">{badge}</span>}
    </button>
  );
}

function LiveDot() { return <span className="mt-live-dot" aria-hidden /> ; }

function HistoryFilters({ stage, setStage, team, setTeam, day, setDay, matches }: {
  stage: string; setStage: (v: string) => void;
  team: string; setTeam: (v: string) => void;
  day: string; setDay: (v: string) => void;
  matches: Match[];
}) {
  const days = useMemo(
    () => [...new Set(matches.map(m => israelDateKey(m.utc)))].sort(),
    [matches]
  );
  function clear() { setStage(""); setTeam(""); setDay(""); }
  const any = stage || team || day;
  return (
    <div className="mt-filters">
      <select value={stage} onChange={e => setStage(e.target.value)} aria-label="שלב">
        <option value="">כל השלבים</option>
        {Object.values(STAGES).sort((a, b) => a.order - b.order)
          .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select value={team} onChange={e => setTeam(e.target.value)} aria-label="קבוצה">
        <option value="">כל הקבוצות</option>
        {Object.values(TEAMS).sort((a, b) => a.name.localeCompare(b.name, "he"))
          .map(t => <option key={t.code} value={t.code}>{t.flag} {t.name}</option>)}
      </select>
      <select value={day} onChange={e => setDay(e.target.value)} aria-label="תאריך">
        <option value="">כל הימים</option>
        {days.map(d => (
          <option key={d} value={d}>{formatIsraelDate(`${d}T12:00:00Z`, { short: true })}</option>
        ))}
      </select>
      {any && <button className="mt-filter-clear" onClick={clear}>נקה</button>}
    </div>
  );
}

function EmptyState({ section }: { section: Section }) {
  const msg = section === "live"     ? "אין משחקים חיים כרגע"
            : section === "today"    ? "אין משחקים היום"
            : section === "upcoming" ? "אין משחקים בשבוע הקרוב"
            : section === "finished" ? "עוד אין משחקים שהסתיימו"
            :                          "לא נמצאו משחקים לפי הסינון";
  return (
    <div className="mt-empty">
      <div className="mt-empty-icon" aria-hidden>⚽</div>
      <div>{msg}</div>
    </div>
  );
}

function GroupedList({ list, section, results, onOpen, isFav, onToggleFav }: {
  list: Match[]; section: Section;
  results: Record<string, { home: number; away: number; finishedAt: number }>;
  onOpen: (id: string) => void;
  isFav: (m: Match) => boolean;
  onToggleFav: (code: string) => void;
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of list) {
      const k = israelDateKey(m.utc);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(m);
    }
    return [...map.entries()];
  }, [list]);

  return (
    <>
      {byDay.map(([day, ms]) => (
        <div key={day} className="mt-day">
          <div className="mt-day-header">
            <span className="mt-day-label">{formatIsraelDate(ms[0].utc)}</span>
            {relativeLabel(ms[0].utc) && <span className="mt-day-rel">{relativeLabel(ms[0].utc)}</span>}
            <span className="mt-day-count">{ms.length} משחקים</span>
          </div>
          <div className="mt-cards">
            {ms.map(m => (
              <MatchCardModern key={m.id} match={m} result={results[m.id]}
                onOpen={() => onOpen(m.id)}
                isFav={isFav(m)} onToggleFav={onToggleFav} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/* ---------------------- Modern Match Card ------------------------- */

function MatchCardModern({ match, result, onOpen, isFav, onToggleFav }: {
  match: Match;
  result?: { home: number; away: number; finishedAt: number };
  onOpen: () => void;
  isFav: boolean;
  onToggleFav: (code: string) => void;
}) {
  const home = TEAMS[match.home] || { code: match.home, name: match.home, flag: "❓" };
  const away = TEAMS[match.away] || { code: match.away, name: match.away, flag: "❓" };
  const venue = VENUES[match.venue] || { name: match.venue, city: "", country: "", flag: "" };
  const stage = STAGES[match.stage];
  const status = matchLiveStatus(match);
  const channels = (match.channels || []).map(c => CHANNELS[c]).filter(Boolean);

  /* Live minute estimate (approx, since we don't have a real live feed):
   * minutes since kickoff capped at 90 + ET. */
  const liveMinute = useMemo(() => {
    if (status !== "live") return null;
    const m = Math.floor((Date.now() - +new Date(match.utc)) / 60000);
    if (m >= 105) return "FT?";
    if (m >= 90)  return `90+${m - 90}`;
    if (m >= 60 && m < 65) return "HT";
    if (m >= 45 && m < 50) return "HT";
    return `${m}'`;
  }, [status, match.utc]);

  return (
    <article className={`mt-card status-${status} ${isFav ? "is-fav" : ""}`}
             onClick={onOpen}
             onKeyDown={(e) => e.key === "Enter" && onOpen()}
             role="button" tabIndex={0}>
      <header className="mt-card-head">
        <div className="mt-card-stage">
          <span className="mt-stage-chip">{stage?.name}{match.group ? ` · בית ${match.group}` : ""}</span>
        </div>
        <div className="mt-card-status">
          {status === "live" && (
            <span className="mt-live-pill">
              <span className="mt-live-dot" aria-hidden /> חי · {liveMinute}
            </span>
          )}
          {status === "pregame"  && <span className="mt-status-pill pregame">קדם-משחק</span>}
          {status === "finished" && <span className="mt-status-pill finished">הסתיים</span>}
          {status === "scheduled" && (
            <span className="mt-status-pill scheduled">
              {formatIsraelTime(match.utc)}
            </span>
          )}
        </div>
      </header>

      <div className="mt-card-body">
        {/* Home team */}
        <div className="mt-team home">
          <button className={`mt-fav-star ${isFav ? "on" : ""}`}
                  onClick={(e) => { e.stopPropagation(); onToggleFav(match.home); }}
                  aria-label="הוסף למועדפים" title="מועדפים">
            ★
          </button>
          <span className="mt-flag">{home.flag}</span>
          <span className="mt-team-name">{home.name}</span>
        </div>

        {/* Score / vs */}
        <div className="mt-score-wrap">
          {result ? (
            <div className="mt-score">
              <span className="mt-score-num">{result.home}</span>
              <span className="mt-score-sep">:</span>
              <span className="mt-score-num">{result.away}</span>
            </div>
          ) : status === "live" ? (
            <div className="mt-score live">
              <span className="mt-score-num">–</span>
              <span className="mt-score-sep">:</span>
              <span className="mt-score-num">–</span>
            </div>
          ) : (
            <div className="mt-vs">
              <div className="mt-vs-time">{formatIsraelTime(match.utc)}</div>
              <div className="mt-vs-date">{formatIsraelDate(match.utc, { short: true })}</div>
            </div>
          )}
        </div>

        {/* Away team */}
        <div className="mt-team away">
          <span className="mt-team-name">{away.name}</span>
          <span className="mt-flag">{away.flag}</span>
          <button className={`mt-fav-star ${isFav ? "on" : ""}`}
                  onClick={(e) => { e.stopPropagation(); onToggleFav(match.away); }}
                  aria-label="הוסף למועדפים" title="מועדפים">
            ★
          </button>
        </div>
      </div>

      <footer className="mt-card-foot">
        <span className="mt-venue">🏟 {venue.name}{venue.city ? ` · ${venue.city}` : ""}</span>
        {channels.length > 0 && (
          <span className="mt-broadcast">
            📺 {channels.slice(0, 2).map(c => c.name).join(" · ")}
            {channels.length > 2 ? ` +${channels.length - 2}` : ""}
          </span>
        )}
      </footer>
    </article>
  );
}
