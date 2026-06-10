/* =====================================================================
 * Lineups — formation-aware starting XI builder.
 * Production deployment can replace `defaultLineup()` with a fetch from
 * API-Football / SportMonks; the rest of the system is API-agnostic.
 * ===================================================================*/
import type { Position, Player } from "./players";
import { squadFor } from "./players";

export type Formation = "4-3-3" | "4-4-2" | "3-5-2" | "4-2-3-1" | "5-3-2";

/* Pitch coordinates per slot (x: 0-100, y: 0-100; goalkeeper near y=10, attackers near y=90) */
export interface SlotPos {
  pos: Position;
  x: number;
  y: number;
  role?: string; // e.g. "LB", "CM", "ST"
}

/* Formation layouts — viewing the team attacking upward (home team perspective) */
const FORMATIONS: Record<Formation, SlotPos[]> = {
  "4-3-3": [
    { pos: "GK",  x: 50, y: 8,  role: "GK"  },
    { pos: "DEF", x: 15, y: 25, role: "LB"  },
    { pos: "DEF", x: 38, y: 22, role: "CB"  },
    { pos: "DEF", x: 62, y: 22, role: "CB"  },
    { pos: "DEF", x: 85, y: 25, role: "RB"  },
    { pos: "MID", x: 30, y: 50, role: "LCM" },
    { pos: "MID", x: 50, y: 45, role: "CM"  },
    { pos: "MID", x: 70, y: 50, role: "RCM" },
    { pos: "FWD", x: 18, y: 80, role: "LW"  },
    { pos: "FWD", x: 50, y: 85, role: "ST"  },
    { pos: "FWD", x: 82, y: 80, role: "RW"  },
  ],
  "4-4-2": [
    { pos: "GK",  x: 50, y: 8,  role: "GK" },
    { pos: "DEF", x: 15, y: 25, role: "LB" },
    { pos: "DEF", x: 38, y: 22, role: "CB" },
    { pos: "DEF", x: 62, y: 22, role: "CB" },
    { pos: "DEF", x: 85, y: 25, role: "RB" },
    { pos: "MID", x: 15, y: 55, role: "LM" },
    { pos: "MID", x: 38, y: 50, role: "CM" },
    { pos: "MID", x: 62, y: 50, role: "CM" },
    { pos: "MID", x: 85, y: 55, role: "RM" },
    { pos: "FWD", x: 38, y: 82, role: "ST" },
    { pos: "FWD", x: 62, y: 82, role: "ST" },
  ],
  "3-5-2": [
    { pos: "GK",  x: 50, y: 8,  role: "GK" },
    { pos: "DEF", x: 28, y: 22, role: "CB" },
    { pos: "DEF", x: 50, y: 20, role: "CB" },
    { pos: "DEF", x: 72, y: 22, role: "CB" },
    { pos: "MID", x: 12, y: 50, role: "LWB" },
    { pos: "MID", x: 35, y: 50, role: "LCM" },
    { pos: "MID", x: 50, y: 45, role: "CM"  },
    { pos: "MID", x: 65, y: 50, role: "RCM" },
    { pos: "MID", x: 88, y: 50, role: "RWB" },
    { pos: "FWD", x: 40, y: 82, role: "ST" },
    { pos: "FWD", x: 60, y: 82, role: "ST" },
  ],
  "4-2-3-1": [
    { pos: "GK",  x: 50, y: 8,  role: "GK"  },
    { pos: "DEF", x: 15, y: 25, role: "LB"  },
    { pos: "DEF", x: 38, y: 22, role: "CB"  },
    { pos: "DEF", x: 62, y: 22, role: "CB"  },
    { pos: "DEF", x: 85, y: 25, role: "RB"  },
    { pos: "MID", x: 38, y: 45, role: "CDM" },
    { pos: "MID", x: 62, y: 45, role: "CDM" },
    { pos: "MID", x: 18, y: 68, role: "LAM" },
    { pos: "MID", x: 50, y: 65, role: "CAM" },
    { pos: "MID", x: 82, y: 68, role: "RAM" },
    { pos: "FWD", x: 50, y: 85, role: "ST"  },
  ],
  "5-3-2": [
    { pos: "GK",  x: 50, y: 8,  role: "GK"  },
    { pos: "DEF", x: 10, y: 28, role: "LWB" },
    { pos: "DEF", x: 30, y: 22, role: "CB"  },
    { pos: "DEF", x: 50, y: 20, role: "CB"  },
    { pos: "DEF", x: 70, y: 22, role: "CB"  },
    { pos: "DEF", x: 90, y: 28, role: "RWB" },
    { pos: "MID", x: 35, y: 52, role: "CM"  },
    { pos: "MID", x: 50, y: 48, role: "CM"  },
    { pos: "MID", x: 65, y: 52, role: "CM"  },
    { pos: "FWD", x: 40, y: 82, role: "ST"  },
    { pos: "FWD", x: 60, y: 82, role: "ST"  },
  ],
};

export interface LineupSlot extends SlotPos {
  player: Player;
}

export interface TeamLineup {
  teamCode: string;
  formation: Formation;
  slots: LineupSlot[];
}

/* Default lineup builder — picks best-jersey players for each position.
 * Returns an empty `slots` array when no verified squad is available
 * (rather than fabricating players). Callers should handle empty lineups. */
export function defaultLineup(teamCode: string, formation: Formation = "4-3-3", liveSquads?: Record<string, Player[]>): TeamLineup {
  const squad = squadFor(teamCode, liveSquads);
  const layout = FORMATIONS[formation];
  const slots: LineupSlot[] = [];

  if (!squad.length) return { teamCode, formation, slots };

  const used = new Set<string>();
  const byPos: Record<Position, Player[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  squad.forEach(p => byPos[p.position].push(p));
  /* Live squads don't include jersey numbers — fall back to original order. */
  Object.values(byPos).forEach(arr => arr.sort((a, b) => (a.jersey ?? 999) - (b.jersey ?? 999)));

  for (const slot of layout) {
    const pool = byPos[slot.pos];
    const picked = pool.find(p => !used.has(p.id)) || pool[0] || squad[0];
    if (!picked) continue;
    used.add(picked.id);
    slots.push({ ...slot, player: picked });
  }

  return { teamCode, formation, slots };
}

/* Heuristic formation chooser based on squad composition + opponent strength.
 * Real installs can pull from API. */
const FORMATION_BY_TEAM: Record<string, Formation> = {
  BRA: "4-2-3-1", ARG: "4-3-3", FRA: "4-3-3", ENG: "4-2-3-1",
  ESP: "4-3-3",   GER: "4-2-3-1", POR: "4-3-3", NED: "4-3-3",
  ITA: "3-5-2",   MEX: "4-3-3",   USA: "4-4-2", CAN: "4-3-3",
};

export function pickFormation(teamCode: string): Formation {
  return FORMATION_BY_TEAM[teamCode] || "4-3-3";
}

export function buildMatchLineups(homeTeam: string, awayTeam: string, liveSquads?: Record<string, Player[]>): { home: TeamLineup; away: TeamLineup } {
  return {
    home: defaultLineup(homeTeam, pickFormation(homeTeam), liveSquads),
    away: defaultLineup(awayTeam, pickFormation(awayTeam), liveSquads),
  };
}
