"use client";
import { useEffect, useMemo, useState } from "react";
import { MATCHES, TEAMS, CHANNELS, VENUES, STAGES } from "@/lib/data";
import { useStore } from "@/lib/store";
import {
  formatIsraelDate, formatIsraelTime, matchLiveStatus,
} from "@/lib/utils";
import { effMatch } from "@/lib/sim";
import type { Match } from "@/lib/types";
import MatchModal from "./MatchModal";
import Countdown from "./Countdown";

export default function Broadcasts() {
  const overrides = useStore(s => s.overrides);
  const simConfig = useStore(s => s.simConfig);
  const matches = useMemo(() => MATCHES.map(m => effMatch(m, overrides[m.id], simConfig)), [overrides, simConfig]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);

  const { live, next } = useMemo(() => {
    const sorted = [...matches].sort((a,b) => +new Date(a.utc) - +new Date(b.utc));
    let live: Match | null = null, next: Match | null = null;
    for (const m of sorted) {
      const st = matchLiveStatus(m);
      if ((st === "live" || st === "pregame") && !live) live = m;
      if (st === "scheduled" && !next) next = m;
      if (live && next) break;
    }
    return { live, next };
  }, [matches]);

  useEffect(() => {
    const id = setInterval(() => {
      const upcoming = matches.filter(m => matchLiveStatus(m) === "scheduled");
      if (!upcoming.length) return;
      const m = upcoming[Math.floor(Math.random() * Math.min(upcoming.length, 5))];
      const home = TEAMS[m.home]?.name || m.home;
      const away = TEAMS[m.away]?.name || m.away;
      const samples = [
        `📡 ${home} – ${away} ישודר גם בערוץ ספורט 5+`,
        `⏱️ שריקת הפתיחה ל-${home} – ${away} עשויה להידחות ב-5 דק׳`,
        `🎙️ שינוי בצוות השידור למשחק ${home} – ${away}`,
        `📺 כאן 11 הוסיפו תוכנית אולפן מורחבת לפני ${home} – ${away}`,
      ];
      const text = samples[Math.floor(Math.random() * samples.length)];
      setNotices(n => [text, ...n].slice(0, 5));
    }, 25000);
    return () => clearInterval(id);
  }, [matches]);

  return (
    <>
      <section>
        <div className="hero-grid">
          {live ? <HeroCard match={live} badge="🔴 משודר עכשיו" onOpen={setOpenId} />
                : <div className="hero-empty"><h3>אין שידור חי כרגע</h3><p className="muted">המשחק הבא יתחיל בקרוב.</p></div>}
          {next && <HeroCard match={next} badge="⏭️ המשחק הבא" onOpen={setOpenId} />}
        </div>
      </section>

      <section>
        <h2 className="sec-title">🇮🇱 ערוצי השידור</h2>
        <ChannelGrid matches={matches} />
      </section>

      <section>
        <h2 className="sec-title">📅 לוח שידורים מלא לפי ערוץ</h2>
        <ByChannel matches={matches} onOpen={setOpenId} />
      </section>

      <div className="ticker">
        {notices.map((n, i) => <div key={i} className="ticker-item">{n}</div>)}
      </div>

      {openId && <MatchModal matchId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function HeroCard({ match: m, badge, onOpen }: { match: Match; badge: string; onOpen: (id: string) => void }) {
  const home = TEAMS[m.home] || { name: m.home, flag: "❓" };
  const away = TEAMS[m.away] || { name: m.away, flag: "❓" };
  const channels = (m.channels || []).map(c => CHANNELS[c]).filter(Boolean);
  const venue = VENUES[m.venue] || { name: m.venue, city: "", flag: "" };
  return (
    <article className="hero-card">
      <div className="hero-badge">{badge}</div>
      <div className="hero-teams">
        <div className="hero-team"><span className="hero-flag">{home.flag}</span><div>{home.name}</div></div>
        <div className="hero-vs">
          <div className="hero-time">{formatIsraelTime(m.utc)}</div>
          <div className="hero-date muted">{formatIsraelDate(m.utc, { short: true })}</div>
          <Countdown utc={m.utc} className="hero-cd" />
        </div>
        <div className="hero-team"><span className="hero-flag">{away.flag}</span><div>{away.name}</div></div>
      </div>
      <div className="hero-venue muted">🏟️ {venue.name} · {venue.city} {venue.flag}</div>
      <div className="bc-chips">
        {channels.map(c => (
          <a key={c.id} className="channel-chip channel-big" style={{ ["--ch" as any]: c.color }} href={c.url} target="_blank" rel="noopener">
            <span className="channel-logo">{c.logo}</span><span>{c.name}</span>
          </a>
        ))}
      </div>
      <button className="btn btn-primary" onClick={() => onOpen(m.id)}>פתח עמוד משחק</button>
    </article>
  );
}

function ChannelGrid({ matches }: { matches: Match[] }) {
  return (
    <div className="ch-grid">
      {Object.values(CHANNELS).map(c => {
        const cMatches = matches.filter(m => (m.channels || []).includes(c.id));
        const nextC = cMatches.filter(m => +new Date(m.utc) > Date.now()).sort((a,b) => +new Date(a.utc) - +new Date(b.utc))[0];
        return (
          <a key={c.id} className="ch-card" style={{ ["--ch" as any]: c.color }} href={c.url} target="_blank" rel="noopener">
            <div className="ch-card-head"><span className="ch-logo">{c.logo}</span><span className="ch-card-name">{c.name}</span></div>
            <div className="ch-card-type muted">{c.type}</div>
            <div className="ch-card-count">{cMatches.length}</div>
            <div className="ch-card-label muted">משחקים</div>
            {nextC && <div className="ch-card-next muted">הבא: {formatIsraelTime(nextC.utc)} · {formatIsraelDate(nextC.utc, { short: true })}</div>}
          </a>
        );
      })}
    </div>
  );
}

function ByChannel({ matches, onOpen }: { matches: Match[]; onOpen: (id: string) => void }) {
  return (
    <>
      {Object.values(CHANNELS).map(c => {
        const cMatches = matches.filter(m => (m.channels || []).includes(c.id))
          .sort((a,b) => +new Date(a.utc) - +new Date(b.utc));
        return (
          <details key={c.id} className="ch-section" style={{ ["--ch" as any]: c.color }} open={cMatches.length > 0}>
            <summary>
              <span className="ch-logo">{c.logo}</span>
              <a href={c.url} target="_blank" rel="noopener" className="ch-name" onClick={e => e.stopPropagation()}>{c.name}</a>
              <span className="muted">{c.type}</span>
              <span className="chip chip-strong">{cMatches.length} משחקים</span>
            </summary>
            <div className="ch-list">
              {cMatches.map(m => {
                const home = TEAMS[m.home] || { name: m.home, flag: "❓" };
                const away = TEAMS[m.away] || { name: m.away, flag: "❓" };
                const status = matchLiveStatus(m);
                return (
                  <button key={m.id} className={`ch-row status-${status}`} onClick={() => onOpen(m.id)}>
                    <div className="ch-row-time">
                      <div className="ch-t">{formatIsraelTime(m.utc)}</div>
                      <div className="ch-d muted">{formatIsraelDate(m.utc, { short: true })}</div>
                    </div>
                    <div className="ch-row-teams">
                      <span>{home.flag} {home.name}</span> <span className="muted">נגד</span> <span>{away.name} {away.flag}</span>
                    </div>
                    <div className="ch-row-stage muted">{STAGES[m.stage]?.name}{m.group ? ` · בית ${m.group}` : ""}</div>
                    <Countdown utc={m.utc} className="ch-row-cd" />
                    {status === "live" && <span className="badge badge-live">🔴 חי</span>}
                  </button>
                );
              })}
            </div>
          </details>
        );
      })}
    </>
  );
}
