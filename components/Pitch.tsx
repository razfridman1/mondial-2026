"use client";
import { TEAMS } from "@/lib/data";
import type { TeamLineup } from "@/lib/lineups";

/* =====================================================================
 * SVG football pitch with positioned players for both teams.
 * Home team attacks upward (bottom half), Away team attacks downward (top half).
 * ===================================================================*/

export default function Pitch({
  home, away, compact = false,
}: { home: TeamLineup; away: TeamLineup; compact?: boolean }) {
  const homeTeam = TEAMS[home.teamCode];
  const awayTeam = TEAMS[away.teamCode];
  const W = 600;
  const H = 900;

  /* If either side has no verified squad, show an explanatory placeholder
   * instead of the pitch. We don't invent players. */
  if (!home.slots.length || !away.slots.length) {
    const missing: string[] = [];
    if (!home.slots.length) missing.push(homeTeam?.name || home.teamCode);
    if (!away.slots.length) missing.push(awayTeam?.name || away.teamCode);
    return (
      <div className="pitch-wrap pitch-empty">
        <div className="pitch-empty-title">⚽ ההרכב הצפוי יתעדכן בקרוב</div>
        <div className="pitch-empty-body">
          טרם הוזן במערכת הרכב משוער עבור {missing.join(" ו-")}.
          ברגע שהנתונים יעודכנו, ההרכב יופיע כאן אוטומטית.
        </div>
      </div>
    );
  }

  function dot(x: number, y: number, color: string, label: string, sub?: string, opts: { isAway?: boolean } = {}) {
    const px = (x / 100) * W;
    const py = (y / 100) * H;
    return (
      <g key={`${color}-${x}-${y}-${label}`} className="pitch-player">
        <circle cx={px} cy={py} r={compact ? 14 : 18} fill={color} stroke="#fff" strokeWidth={2} />
        <text x={px} y={py + 5} textAnchor="middle"
              fill="#fff" fontWeight="900" fontSize={compact ? 12 : 15}
              fontFamily="Heebo, Rubik, sans-serif">
          {label}
        </text>
        {sub && (
          <text x={px} y={py + (compact ? 28 : 36)} textAnchor="middle"
                fill="#fff" fontWeight="700" fontSize={compact ? 10 : 12}
                fontFamily="Heebo, sans-serif"
                style={{ paintOrder: "stroke" }}
                stroke="#0a4d2a" strokeWidth={3}>
            {sub}
          </text>
        )}
      </g>
    );
  }

  return (
    <div className="pitch-wrap">
      <div className="pitch-team-bar">
        <div className="pitch-team home">
          <span className="flag">{homeTeam?.flag}</span>
          <span>{homeTeam?.name}</span>
          <span className="muted">· {home.formation}</span>
        </div>
        <div className="pitch-team away">
          <span className="muted">{away.formation} ·</span>
          <span>{awayTeam?.name}</span>
          <span className="flag">{awayTeam?.flag}</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="pitch-svg" preserveAspectRatio="xMidYMid meet">
        {/* grass stripes */}
        <defs>
          <pattern id="grass" width="60" height="60" patternUnits="userSpaceOnUse">
            <rect width="60" height="60" fill="#0a4d2a"/>
            <rect width="60" height="30" fill="#0b572f"/>
          </pattern>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill="url(#grass)"/>

        {/* outer border */}
        <rect x={20} y={20} width={W - 40} height={H - 40} fill="none" stroke="#fff" strokeWidth={3}/>

        {/* center line + circle */}
        <line x1={20} y1={H/2} x2={W - 20} y2={H/2} stroke="#fff" strokeWidth={3}/>
        <circle cx={W/2} cy={H/2} r={80} fill="none" stroke="#fff" strokeWidth={3}/>
        <circle cx={W/2} cy={H/2} r={4} fill="#fff"/>

        {/* home goal area (bottom) */}
        <rect x={W/2 - 110} y={H - 60} width={220} height={40} fill="none" stroke="#fff" strokeWidth={3}/>
        <rect x={W/2 - 200} y={H - 140} width={400} height={120} fill="none" stroke="#fff" strokeWidth={3}/>
        <circle cx={W/2} cy={H - 110} r={3} fill="#fff"/>

        {/* away goal area (top) */}
        <rect x={W/2 - 110} y={20} width={220} height={40} fill="none" stroke="#fff" strokeWidth={3}/>
        <rect x={W/2 - 200} y={20}  width={400} height={120} fill="none" stroke="#fff" strokeWidth={3}/>
        <circle cx={W/2} cy={110} r={3} fill="#fff"/>

        {/* Home players occupy bottom half (y: 50-100 in our 0-100 coords) */}
        {home.slots.map(slot => dot(
          slot.x, 50 + slot.y * 0.5, "#2e6bff",
          String(slot.player.jersey),
          slot.player.name.split(" ").slice(-1)[0],
        ))}

        {/* Away players occupy top half (mirror: y: 0-50) */}
        {away.slots.map(slot => dot(
          100 - slot.x, 50 - slot.y * 0.5, "#dc2626",
          String(slot.player.jersey),
          slot.player.name.split(" ").slice(-1)[0],
          { isAway: true }
        ))}
      </svg>

      <div className="pitch-legend">
        <div><span className="dot home"></span>{homeTeam?.name} ({home.formation})</div>
        <div><span className="dot away"></span>{awayTeam?.name} ({away.formation})</div>
      </div>
    </div>
  );
}
