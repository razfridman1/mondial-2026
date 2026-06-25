/* Shared types for /api/live-now — imported by both the route (server)
 * and MatchesTab (client). No server-only imports here. */

export interface LiveNowMatch {
  matchId: string;
  homeCode: string;
  awayCode: string;
  homeScore: number;
  awayScore: number;
  status: string;
  minuteLabel: string;
  elapsed: number | null;
  goals: Array<{
    minute: number | null;
    team: "home" | "away";
    player: string;
    assist?: string;
    type?: string;
  }>;
  source: string;
}

export interface LiveNowResponse {
  matches: LiveNowMatch[];
  fetchedAt: number;
  sources: string[];
}
