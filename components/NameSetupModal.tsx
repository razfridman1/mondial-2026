"use client";
/* =====================================================================
 * NameSetupModal — mandatory display-name picker shown to new users
 * after they join a group via an invite link.
 *
 * Can't be dismissed without entering a valid name (2-30 chars).
 * Saves to profiles/{uid}.displayName and updates the zustand mirror.
 * ===================================================================*/
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { setUserDoc } from "@/lib/firebase";

const NAME_CONFIRMED_KEY = "display_name_confirmed_v1";

export default function NameSetupModal({ onDone }: { onDone: () => void }) {
  const user    = useStore(s => s.user);
  const profile = useStore(s => s.profile);
  const [name, setName] = useState(profile?.displayName || "");
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);

  /* If profile loads AFTER the modal opens (race with hydrateFromFirestore),
   * pre-fill the field with the loaded displayName so the user can either
   * keep it or edit. We only fill when the field is still empty so we don't
   * overwrite the user's typing. */
  useEffect(() => {
    if (!name && profile?.displayName) setName(profile.displayName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.displayName]);

  async function save() {
    const trimmed = name.trim();
    if (trimmed.length < 2) { setErr("שם קצר מדי — לפחות 2 תווים"); return; }
    if (trimmed.length > 30) { setErr("שם ארוך מדי — עד 30 תווים"); return; }
    if (!user) { setErr("אינך מחובר"); return; }
    setBusy(true); setErr(null);
    try {
      await setUserDoc(`profiles/${user.uid}`, { displayName: trimmed });
      useStore.setState(s => ({
        profile: s.profile ? { ...s.profile, displayName: trimmed } : null,
      }));
      /* Mark that this user has actively confirmed their display name,
       * so the modal won't re-appear on subsequent invite joins. */
      try { localStorage.setItem(`${NAME_CONFIRMED_KEY}:${user.uid}`, "1"); } catch {}
      onDone();
    } catch (e: any) {
      setErr(e?.message || "שגיאה בשמירה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 200 }}>
      <div className="modal name-setup-modal" role="dialog" aria-modal="true"
           onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: 0, fontSize: 22 }}>👋 ברוך הבא!</h2>
        <p className="muted" style={{ marginTop: 6, lineHeight: 1.6 }}>
          הצטרפת לקבוצה בהצלחה 🎉<br/>
          איך תרצה שיציגו אותך בלוח התוצאות? בחר שם/כינוי שיופיע לחברי הקבוצה.
        </p>

        <div className="name-setup-row">
          <label htmlFor="ns-name" className="muted" style={{ fontSize: 12 }}>שם/כינוי שיוצג לחברים</label>
          <input id="ns-name"
                 className="pred-input"
                 value={name}
                 maxLength={30}
                 onChange={e => setName(e.target.value)}
                 onKeyDown={e => { if (e.key === "Enter") save(); }}
                 placeholder="לדוגמה: דני המנחש"
                 autoFocus
                 style={{ fontSize: 18, width: "100%", padding: "12px 14px" }} />
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            2-30 תווים. ניתן לשנות מאוחר יותר בלשונית הפרופיל.
          </div>
        </div>

        {err && (
          <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>
            {err}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn btn-primary"
                  disabled={busy || name.trim().length < 2}
                  onClick={save}
                  style={{ fontWeight: 700, padding: "12px 26px" }}>
            {busy ? "שומר…" : "שמור והמשך ▶"}
          </button>
        </div>
      </div>
    </div>
  );
}
