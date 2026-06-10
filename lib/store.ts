/* =====================================================================
 * Client-side state store (Zustand) + persistent prefs.
 * ===================================================================*/
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "firebase/auth";
import { getFirebase, getUserDoc, setUserDoc, subscribeOverrides, subscribeSimConfig, watchAuth, signOut as fbSignOut, signInWithToken } from "./firebase";
import type { SimConfig } from "./sim";
import type {
  BroadcastOverrideDoc, AppUser, Prediction,
  UserProfile, Group, ActivityEvent, AchievementUnlock,
} from "./types";
import type { Player, Coach } from "./players";
import { defaultAvatarId } from "./avatars";

interface Prefs {
  view: "card" | "timeline";
  selectedDay: string | null;
  selectedGroup: string | null;
  selectedStage: string | null;
  selectedChannel: string | null;
  selectedTeam: string | null;
  statusFilter: "all" | "live" | "upcoming";
  tab: "schedule" | "weekpredictions" | "mypredictions" | "ranking" | "standings" | "broadcasts" | "teams" | "myteams" | "bracket" | "mygroups" | "ai" | "profile" | "admin" | "simulation" | "superadmin";
}

export type MatchResult = { home: number; away: number; finishedAt: number };

interface MondialState {
  user: AppUser | null;
  loadingAuth: boolean;
  profile: UserProfile | null;
  predictions: Record<string, Prediction>;  // by matchId
  matchResults: Record<string, MatchResult>; // by matchId
  overrides: Record<string, BroadcastOverrideDoc>;
  groups: Group[];           // active groups the user belongs to
  leftGroups: Group[];       // groups the user has soft-left (can rejoin)
  currentGroupId: string | null;
  achievements: AchievementUnlock[];
  recentActivity: ActivityEvent[];
  simConfig: SimConfig | null;
  liveSquads: Record<string, Player[]>;   // teamCode → squad, pulled live from football-data.org
  liveCoaches: Record<string, Coach>;     // teamCode → coach, pulled live from football-data.org
  liveSquadsLoaded: boolean;
  prefs: Prefs;
  setUser: (u: AppUser | null) => void;
  setLoadingAuth: (b: boolean) => void;
  setPrediction: (matchId: string, home: number, away: number, joker?: boolean, predictedWinner?: string) => Promise<void>;
  clearPrediction: (matchId: string) => Promise<void>;
  clearStagePredictions: (stage: string) => Promise<{ deleted: number; locked: number }>;
  setProfileAvatar: (avatarId: string) => Promise<void>;
  addTrackedTeam: (teamCode: string) => Promise<void>;
  removeTrackedTeam: (teamCode: string) => Promise<void>;
  setCurrentGroup: (gid: string | null) => void;
  refreshGroups: () => Promise<void>;
  leaveGroup: (groupId: string) => Promise<void>;
  rejoinGroup: (groupId: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  refreshMatchResults: () => Promise<void>;
  setPref: <K extends keyof Prefs>(key: K, val: Prefs[K]) => void;
  hydrateFromFirestore: (uid: string) => Promise<void>;
  signOut: () => Promise<void>;
  setOverrides: (o: Record<string, BroadcastOverrideDoc>) => void;
  setSimConfig: (c: SimConfig | null) => void;
  loadLiveSquads: () => Promise<void>;
}

export const useStore = create<MondialState>()(
  persist(
    (set, get) => ({
      user: null,
      loadingAuth: true,
      profile: null,
      predictions: {},
      matchResults: {},
      overrides: {},
      groups: [],
      leftGroups: [],
      currentGroupId: null,
      achievements: [],
      recentActivity: [],
      simConfig: null,
      liveSquads: {},
      liveCoaches: {},
      liveSquadsLoaded: false,
      prefs: {
        view: "card",
        selectedDay: null,
        selectedGroup: null,
        selectedStage: null,
        selectedChannel: null,
        selectedTeam: null,
        statusFilter: "all",
        tab: "schedule",
      },
      setUser: (u) => set({ user: u }),
      setLoadingAuth: (b) => set({ loadingAuth: b }),
      setPrediction: async (matchId, home, away, joker?: boolean, predictedWinner?: string) => {
        const u = get().user;
        if (!u) {
          // anon — keep in local store only
          const p = { ...get().predictions };
          p[matchId] = { uid: "anon", matchId, homeScore: home, awayScore: away, updatedAt: Date.now(), joker: !!joker, predictedWinner };
          set({ predictions: p });
          return;
        }
        const token = await getFirebase().auth!.currentUser!.getIdToken();
        const r = await fetch("/api/predictions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ matchId, homeScore: home, awayScore: away, joker: !!joker, predictedWinner }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.message || err.error || "save failed");
        }
        const data = await r.json();
        const p = { ...get().predictions };
        p[matchId] = {
          uid: u.uid, matchId,
          homeScore: home, awayScore: away,
          updatedAt: Date.now(),
          joker: !!data.joker,
          ...(predictedWinner ? { predictedWinner } : {}),
        };
        set({ predictions: p });
      },
      clearPrediction: async (matchId: string) => {
        const u = get().user;
        if (!u) {
          /* anon — just remove locally */
          const p = { ...get().predictions };
          delete p[matchId];
          set({ predictions: p });
          return;
        }
        const token = await getFirebase().auth!.currentUser!.getIdToken();
        const r = await fetch(`/api/predictions?matchId=${encodeURIComponent(matchId)}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.message || err.error || "delete failed");
        }
        const p = { ...get().predictions };
        delete p[matchId];
        set({ predictions: p });
      },
      clearStagePredictions: async (stage: string) => {
        const u = get().user;
        if (!u) return { deleted: 0, locked: 0 };
        const token = await getFirebase().auth!.currentUser!.getIdToken();
        const r = await fetch(`/api/predictions?stage=${encodeURIComponent(stage)}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.message || err.error || "stage delete failed");
        }
        const data = await r.json();
        /* refetch all predictions to stay in sync */
        try {
          const pr = await fetch(`/api/predictions?uid=${u.uid}`);
          if (pr.ok) {
            const arr = await pr.json();
            const map: any = {};
            for (const p of arr) map[p.matchId] = p;
            set({ predictions: map });
          }
        } catch {}
        return { deleted: data.deleted || 0, locked: data.locked || 0 };
      },
      setProfileAvatar: async (avatarId: string) => {
        const u = get().user;
        if (!u) return;
        const next: UserProfile = {
          uid: u.uid,
          avatarId,
          displayName: get().profile?.displayName || u.displayName || (u.email?.split("@")[0]) || "משתמש",
          bio: get().profile?.bio,
          joinedAt: get().profile?.joinedAt || Date.now(),
        };
        set({ profile: next });
        await setUserDoc(`profiles/${u.uid}`, next);
      },
      addTrackedTeam: async (teamCode) => {
        const u = get().user;
        const prof = get().profile;
        if (!u || !prof) return;
        const cur = prof.trackedTeams || [];
        if (cur.includes(teamCode)) return;
        const trackedTeams = [...cur, teamCode];
        set({ profile: { ...prof, trackedTeams } });
        try { await setUserDoc(`profiles/${u.uid}`, { trackedTeams }); } catch {}
      },
      removeTrackedTeam: async (teamCode) => {
        const u = get().user;
        const prof = get().profile;
        if (!u || !prof) return;
        const trackedTeams = (prof.trackedTeams || []).filter(c => c !== teamCode);
        set({ profile: { ...prof, trackedTeams } });
        try { await setUserDoc(`profiles/${u.uid}`, { trackedTeams }); } catch {}
      },
      setCurrentGroup: (gid) => set({ currentGroupId: gid }),
      refreshMatchResults: async () => {
        try {
          const r = await fetch("/api/match-results");
          if (r.ok) {
            const data = await r.json();
            set({ matchResults: data });
          }
        } catch {}
      },
      refreshGroups: async () => {
        const u = get().user;
        if (!u) { set({ groups: [], leftGroups: [] }); return; }
        try {
          const token = await getFirebase().auth!.currentUser!.getIdToken();
          /* Fetch both active and left memberships in one call. */
          const r = await fetch("/api/groups/mine?includeLeft=true", {
            headers: { authorization: `Bearer ${token}` },
          });
          if (r.ok) {
            const all = await r.json();
            const groups = all.filter((g: any) => !g._left);
            const leftGroups = all.filter((g: any) => g._left);
            set({ groups, leftGroups });
            const cur = get().currentGroupId;
            /* If the current group was removed/left, switch to first active. */
            if (cur && !groups.find((g: any) => g.id === cur)) {
              set({ currentGroupId: groups[0]?.id || null });
            } else if (!cur && groups[0]) {
              set({ currentGroupId: groups[0].id });
            }
          }
        } catch {}
      },
      leaveGroup: async (groupId: string) => {
        const u = get().user;
        if (!u) throw new Error("not logged in");
        const token = await getFirebase().auth!.currentUser!.getIdToken();
        const r = await fetch("/api/groups/leave", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ groupId }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || "leave failed");
        }
        await get().refreshGroups();
      },
      rejoinGroup: async (groupId: string) => {
        const u = get().user;
        if (!u) throw new Error("not logged in");
        const token = await getFirebase().auth!.currentUser!.getIdToken();
        const r = await fetch("/api/groups/rejoin", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ groupId }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || "rejoin failed");
        }
        await get().refreshGroups();
      },
      deleteGroup: async (groupId: string) => {
        const u = get().user;
        if (!u) throw new Error("not logged in");
        const token = await getFirebase().auth!.currentUser!.getIdToken();
        const r = await fetch(`/api/groups/${groupId}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || "delete failed");
        }
        await get().refreshGroups();
      },
      setPref: (key, val) => set(state => ({ prefs: { ...state.prefs, [key]: val } })),
      hydrateFromFirestore: async (uid) => {
        const profDoc  = await getUserDoc<UserProfile>(`profiles/${uid}`);
        let predictions: Record<string, Prediction> = {};
        try {
          const r = await fetch(`/api/predictions?uid=${uid}`);
          if (r.ok) {
            const arr: Prediction[] = await r.json();
            arr.forEach(p => { predictions[p.matchId] = p; });
          }
        } catch {}
        const authUser = get().user;
        let profile: UserProfile;
        if (profDoc) {
          profile = profDoc;
          /* Heal old profiles where displayName was never set (or is the
           * generic "משתמש" placeholder) — backfill from Google Auth. */
          const looksUnset = !profDoc.displayName || profDoc.displayName === "משתמש";
          const better =
            authUser?.displayName ||
            (authUser?.email ? authUser.email.split("@")[0] : null);
          if (looksUnset && better) {
            profile = { ...profDoc, displayName: better };
            try { await setUserDoc(`profiles/${uid}`, profile); } catch {}
          }
        } else {
          /* No profile doc yet — Google sign-in's first time, or local-only
           * profile created in a past version. Persist NOW to Firestore so
           * server-side queries (leaderboard, etc.) see the real name. */
          profile = {
            uid,
            avatarId: defaultAvatarId(),
            displayName: authUser?.displayName || authUser?.email?.split("@")[0] || "משתמש",
            joinedAt: Date.now(),
          };
          try { await setUserDoc(`profiles/${uid}`, profile); } catch {}
        }
        set({ predictions, profile });
        await get().refreshGroups();
      },
      signOut: async () => {
        await fbSignOut();
        /* Drop the server session cookie too, otherwise the next load would
         * silently restore the user we just signed out. */
        try { await fetch("/api/auth/session", { method: "DELETE" }); } catch {}
        set({ user: null });
      },
      setOverrides: (o) => set({ overrides: o }),
      setSimConfig: (c) => set({ simConfig: c }),
      loadLiveSquads: async () => {
        if (get().liveSquadsLoaded) return;
        try {
          const r = await fetch("/api/squads");
          if (r.ok) {
            const data = await r.json();
            set({ liveSquads: data.squads || {}, liveCoaches: data.coaches || {}, liveSquadsLoaded: true });
          }
        } catch {}
      },
    }),
    {
      name: "mondial26-store",
      /* Persist all prefs EXCEPT the active tab — every fresh visit/launch
       * should land on "⚽ משחקים" (schedule), regardless of which tab the
       * user was last on. Other prefs (view, filters, etc.) still persist. */
      partialize: (state) => ({
        prefs: { ...state.prefs, tab: "schedule" as const },
      }),
    }
  )
);

/* Bootstrapper: subscribes to auth + overrides once on the client. */
let bootstrapped = false;
let sessionRestoreTried = false;
export function bootstrap() {
  if (typeof window === "undefined" || bootstrapped) return;
  bootstrapped = true;
  const { auth } = getFirebase();
  if (!auth) { useStore.getState().setLoadingAuth(false); return; }

  watchAuth(async (u: User | null) => {
    if (!u) {
      /* No client-side session. Before showing the login screen, try ONCE to
       * restore from the server session cookie. This is what keeps users
       * signed in inside in-app browsers (WhatsApp, Instagram…) where
       * localStorage/IndexedDB is wiped on close but cookies survive. */
      if (!sessionRestoreTried) {
        sessionRestoreTried = true;
        try {
          const r = await fetch("/api/auth/session", { method: "GET" });
          if (r.ok) {
            const { token } = await r.json();
            if (token) {
              /* signInWithToken re-triggers this callback with a real user. */
              await signInWithToken(token);
              return;
            }
          }
        } catch {}
      }
      useStore.getState().setUser(null);
      useStore.getState().setLoadingAuth(false);
      return;
    }
    // Check admin via API (verifies ID token server-side)
    const token = await u.getIdToken();
    /* Refresh the server session cookie on every authenticated load (and right
     * after login) so the next open can silently restore the session. */
    try {
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      });
    } catch {}
    let isAdmin = false;
    try {
      const r = await fetch("/api/me", { headers: { authorization: `Bearer ${token}` } });
      if (r.ok) { const j = await r.json(); isAdmin = !!j.isAdmin; }
    } catch {}
    useStore.getState().setUser({
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      photoURL: u.photoURL,
      isAdmin,
    });
    useStore.getState().setLoadingAuth(false);
    await useStore.getState().hydrateFromFirestore(u.uid);
  });

  subscribeOverrides((map) => {
    useStore.getState().setOverrides(map as Record<string, BroadcastOverrideDoc>);
  });
  subscribeSimConfig((cfg) => {
    useStore.getState().setSimConfig(cfg as SimConfig | null);
  });

  /* Load live (football-data.org) squads/coaches once — used to fill in
   * the 35 teams without hand-curated Hebrew squad data. */
  useStore.getState().loadLiveSquads();
}
