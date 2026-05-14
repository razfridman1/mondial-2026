"use client";
import { useEffect, useRef, useState } from "react";
import { bootstrap, useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";
import NameSetupModal from "./NameSetupModal";

const INVITE_KEY = "pending_invite_code";
/* Profile flag (Firestore + zustand mirror) telling us the user has actively
 * confirmed/picked a display name. We always force the name modal after a
 * link-join UNTIL the user has saved at least once. */
const NAME_CONFIRMED_KEY = "display_name_confirmed_v1";

/** Capture ?invite=CODE from current URL and stash in localStorage.
 *  Called both on the main page mount and on the login page mount,
 *  so the code survives a redirect to /login. */
export function captureInviteFromUrl() {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("invite");
    if (!code) return;
    localStorage.setItem(INVITE_KEY, code.trim().toUpperCase());
    // Strip the invite param from the URL so it doesn't show in the address bar.
    params.delete("invite");
    const qs = params.toString();
    const newUrl = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
    window.history.replaceState({}, "", newUrl);
  } catch {}
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const loading = useStore(s => s.loadingAuth);
  const user = useStore(s => s.user);
  const refreshGroups = useStore(s => s.refreshGroups);
  const setCurrentGroup = useStore(s => s.setCurrentGroup);
  const initialTabRef = useRef(false);
  const [askName, setAskName] = useState(false);

  // 1. Capture invite code from URL on mount (before anything else).
  useEffect(() => { captureInviteFromUrl(); }, []);

  // 2. Kick off auth/firestore bootstrapping.
  useEffect(() => { bootstrap(); }, []);

  // 2.4. Fetch match results once on app load + every 60s so MatchCard
  // can show prediction-vs-result for finished matches without refetching
  // per-card.
  useEffect(() => {
    const refresh = useStore.getState().refreshMatchResults;
    refresh?.();
    const id = setInterval(() => { refresh?.(); }, 60_000);
    return () => clearInterval(id);
  }, []);

  // 2.5. On every fresh app load: once the user is identified (logged in),
  // land on the Friends Ranking tab as the default landing screen.
  // Fires only once per mount; subsequent in-app tab clicks are respected.
  useEffect(() => {
    if (initialTabRef.current) return;
    if (!user) return;
    initialTabRef.current = true;
    useStore.getState().setPref("tab", "ranking");
  }, [user]);

  // 3. After login, if there's a pending invite code, auto-join the group.
  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const code = localStorage.getItem(INVITE_KEY);
    if (!code) return;
    (async () => {
      try {
        const token = await getFirebase().auth!.currentUser!.getIdToken();
        const r = await fetch("/api/groups/join", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ inviteCode: code }),
        });
        if (r.ok) {
          const data = await r.json();
          localStorage.removeItem(INVITE_KEY);
          if (data?.ok) {
            // Refresh the user's group list so the new group shows up immediately,
            // and switch the current group to the one we just joined.
            try { await refreshGroups?.(); } catch {}
            try { if (data.groupId) setCurrentGroup?.(data.groupId); } catch {}
            if (!data.alreadyMember) {
              /* New member of this group → force the name modal UNLESS the
               * user has already confirmed a custom display name before
               * (tracked via localStorage flag set by NameSetupModal). */
              const confirmed =
                typeof window !== "undefined" &&
                localStorage.getItem(`${NAME_CONFIRMED_KEY}:${user?.uid || ""}`) === "1";
              if (!confirmed) {
                /* Show modal directly — its content already says
                 * "ברוך הבא! הצטרפת לקבוצה בהצלחה" so no alert needed. */
                setAskName(true);
              } else {
                try { alert("הצטרפת לקבוצה בהצלחה! 🎉"); } catch {}
              }
            }
          }
        } else {
          // Keep the code if it's just a transient error; clear on 404 "group not found"
          if (r.status === 404) localStorage.removeItem(INVITE_KEY);
        }
      } catch {}
    })();
  }, [user, refreshGroups]);

  if (loading) {
    return (
      <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", color:"#9aa3c7" }}>
        ⚽ טוען את מונדיאל 2026…
      </div>
    );
  }
  return (
    <>
      {children}
      {askName && <NameSetupModal onDone={() => setAskName(false)} />}
    </>
  );
}
