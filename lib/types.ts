export type StageId = "GROUP" | "R32" | "R16" | "QF" | "SF" | "THIRD" | "FINAL";
export type MatchStatus = "scheduled" | "pregame" | "live" | "finished" | "postponed" | "cancelled";

export interface Team {
  code: string;
  name: string;     // Hebrew
  nameEn: string;
  flag: string;
  group: string | null;
}

export interface Venue {
  name: string;
  city: string;
  country: string;
  flag: string;
  capacity: number;
}

export interface Channel {
  id: string;
  name: string;
  type: "פתוח" | "כבלים/לוויין" | "סטרימינג";
  logo: string;
  color: string;
  url: string;
  digital: boolean;
}

export interface Stage {
  id: StageId;
  name: string;
  order: number;
}

export interface Odds {
  home: string;
  draw: string;
  away: string;
}

export interface Match {
  id: string;
  utc: string;              // ISO
  stage: StageId;
  group: string | null;
  home: string;
  away: string;
  homeIsPlaceholder?: boolean;
  awayIsPlaceholder?: boolean;
  venue: string;            // venue id
  status: MatchStatus;
  channels: string[];
  preGameMinutes: number;
  studioShow: string | null;
  odds: Odds | null;
  aiInsight: string;
}

/* Firestore documents */
export interface BroadcastOverrideDoc {
  matchId: string;
  utc?: string;
  channels?: string[];
  studioShow?: string;
  status?: MatchStatus;
  reason?: string;
  setByUid?: string;
  setByEmail?: string;
  setAt: number;
}

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAdmin: boolean;
}

/* Prediction: user's guess for a match. Locked at 3 min before kickoff. */
export interface Prediction {
  uid: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
  /* Knockout-only: which team the user picked to advance. Used when the
   * 90-min score is a tie so we can still score winner-correctness. */
  predictedWinner?: string;
  updatedAt: number;
  joker?: boolean;        // ×2 score multiplier for this match
  auto?: boolean;         // generated automatically at kickoff
}

/* Chat message for AI assistant */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts?: number;
}

/* User profile — avatar choice + display name */
export interface UserProfile {
  uid: string;
  avatarId: string;
  displayName: string;
  bio?: string;
  joinedAt: number;
  onboardedAt?: number;   // when the user finished the tutorial
  managed?: boolean;      // true if created by admin via username/password flow
  theme?: "dark" | "light"; // synced across devices
  aiBlocked?: boolean;    // super-admin can block a user from using AI features
}

/* Multi-tenant private group */
export interface Group {
  id: string;
  name: string;
  description?: string;
  ownerUid: string;
  ownerName?: string;
  inviteCode: string;
  createdAt: number;
  memberCount?: number;
}

export interface GroupMembership {
  uid: string;
  groupId: string;
  joinedAt: number;
  role: "owner" | "member";
}

/* Computed leaderboard entry */
export interface LeaderRow {
  uid: string;
  displayName: string;
  avatarId: string;
  totalPoints: number;
  exactCount: number;       // exact-score predictions
  resultCount: number;      // correct result only
  predictionsCount: number;
  streak: number;
  rank?: number;
}

/* Activity feed event */
export type ActivityKind =
  | "prediction.created"
  | "prediction.updated"
  | "prediction.auto"
  | "match.result"
  | "leaderboard.move"
  | "achievement.unlocked"
  | "group.joined"
  | "user.reaction";

export interface ActivityEvent {
  id?: string;
  kind: ActivityKind;
  uid: string;
  displayName: string;
  avatarId: string;
  groupId?: string;
  matchId?: string;
  payload?: Record<string, any>;
  ts: number;
}

/* Achievement / badge */
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface AchievementUnlock {
  uid: string;
  achievementId: string;
  unlockedAt: number;
}

/* Live reaction (emoji bursts) */
export interface FanReaction {
  uid: string;
  emoji: string;
  matchId: string;
  ts: number;
}
