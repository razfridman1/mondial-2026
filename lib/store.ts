/* =====================================================================
 * Client-side state store (Zustand) + persistent prefs.
 * ===================================================================*/
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "firebase/auth";
import { getFirebase, getUserDoc, setUserDoc, subscribeOverrides, subscribeSimConfig, watchAuth, signOut as fbSignOut } from "./firebase";
import type { SimConfig } from "./sim";
import type {
  BroadcastOverrideDoc, AppUser, Prediction,
  UserProfile, Group, ActivityEvent, AchievementUnlock,
} from "./types";
import { defaultAvatarId } from "./avatars";

interface Prefs {
  view: "card" | "timeline";
  selectedDay: string | null;
  selectedGroup: string | null;
  selectedStage: string | null;
  selectedChannel: string | null;
  selectedTeam: string | null;
  statusFilter: "all" | "live" | "upcoming";
  tab: "schedule" | "ranking" | "broadcasts" | "teams" | "bracket" | "ai" | "profile" | "admin" | "simulation" | "superadmin";
}

interface MondialState {
  user: AppUser | null;
  loadingAuth: boolean;
  profile: UserProfile | null;
  predictions: Record<string, Prediction>;  // by matchId
  overrides: Record<string, BroadcastOverrideDoc>;
  groups: Group[];           // groups the user belongs to
  currentGroupId: string | null;
  achievements: AchievementUnlock[];
  recentActivity: ActivityEvent[];
  simConfig: SimConfig | null;
  prefs: Prefs;
  setUser: (u: AppUser | null) => void;
  setLoadingAuth: (b: boolean) => void;
  setPrediction: (matchId: string, home: number, away: number, joker?: boolean) => Promise<void>;
  setProfileAvatar: (avatarId: string) => Promise<void>;
  setCurrentGroup: (gid: string | null) => void;
  refreshGroups: () => Promise<void>;
  setPref: <K extends keyof Prefs>(key: K, val: Prefs[K]) => void;
  hydrateFromFirestore: (uid: string) => Promise<void>;
  signOut: () => Promise<void>;
  setOverrides: (o: Record<string, BroadcastOverrideDoc>) => void;
  setSimConfig: (c: SimConfig | null) => void;
}

export const useStore = create<MondialState>()(
  persist(
    (set, get) => ({
      user: null,
      loadingAuth: true,
      profile: null,
      predictions: {},
      overrides: {},
      groups: [],
      currentGroupId: null,
      achievements: [],
      recentActivity: [],
      simConfig: null,
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
      setPrediction: async (matchId, home, away, joker?: boolean) => {
        const u = get().user;
        if (!u) {
          // anon — keep in local store only
          const p = { ...get().predictions };
          p[matchId] = { uid: "anon", matchId, homeScore: home, awayScore: away, updatedAt: Date.now(), joker: !!joker };
          set({ predictions: p });
          return;
        }
        const token = await getFirebase().auth!.currentUser!.getIdToken();
        const r = await fetch("/api/predictions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ matchId, homeScore: home, awayScore: away, joker: !!joker }),
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
        };
        set({ predictions: p });
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
      setCurrentGroup: (gid) => set({ currentGroupId: gid }),
      refreshGroups: async () => {
        const u = get().user;
        if (!u) { set({ groups: [] }); return; }
        try {
          const token = await getFirebase().auth!.currentUser!.getIdToken();
          const r = await fetch("/api/groups/mine", { headers: { authorization: `Bearer ${token}` } });
          if (r.ok) {
            const groups = await r.json();
            set({ groups });
            if (!get().currentGroupId && groups[0]) set({ currentGroupId: groups[0].id });
          }
        } catch {}
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
        const profile: UserProfile = profDoc || {
          uid,
          avatarId: defaultAvatarId(),
          displayName: get().user?.displayName || get().user?.email?.split("@")[0] || "משתמש",
          joinedAt: Date.now(),
        };
        set({
          predictions,
          profile,
        });
        await get().refreshGroups();
      },
      signOut: async () => {
        await fbSignOut();
        set({ user: null });
      },
      setOverrides: (o) => set({ overrides: o }),
      setSimConfig: (c) => set({ simConfig: c }),
    }),
    {
      name: "mondial26-store",
      partialize: (state) => ({
        prefs: state.prefs,
      }),
    }
  )
);

/* Bootstrapper: subscribes to auth + overrides once on the client. */
let bootstrapped = false;
export function bootstrap() {
  if (typeof window === "undefined" || bootstrapped) return;
  bootstrapped = true;
  const { auth } = getFirebase();
  if (!auth) { useStore.getState().setLoadingAuth(false); return; }

  watchAuth(async (u: User | null) => {
    if (!u) {
      useStore.getState().setUser(null);
      useStore.getState().setLoadingAuth(false);
      return;
    }
    // Check admin via API (verifies ID token server-side)
    const token = await u.getIdToken();
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
}
