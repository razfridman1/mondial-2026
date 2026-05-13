"use client";
import { useState } from "react";
import { AVATARS, getAvatar, defaultAvatarId } from "@/lib/avatars";
import { useStore } from "@/lib/store";

export default function AvatarPicker({ onClose }: { onClose: () => void }) {
  const user = useStore(s => s.user);
  const profile = useStore(s => s.profile);
  const setProfileAvatar = useStore(s => s.setProfileAvatar);
  const [selected, setSelected] = useState<string>(profile?.avatarId || defaultAvatarId());

  async function save() {
    await setProfileAvatar(selected);
    onClose();
  }

  return (
    <div className="modal-overlay avatar-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal avatar-modal" role="dialog">
        <button className="modal-close" onClick={onClose} aria-label="סגור">✕</button>
        <header className="modal-header">
          <h2>👤 בחר אווטר מאגדות הכדורגל</h2>
          <div className="muted">20 אגדות לבחירה</div>
        </header>

        <div className="avatar-grid">
          {AVATARS.map(a => (
            <button
              key={a.id}
              className={`avatar-item ${selected === a.id ? "is-selected" : ""}`}
              onClick={() => setSelected(a.id)}
              title={a.name}
            >
              <div
                className="avatar-img"
                dangerouslySetInnerHTML={{ __html: a.svg(160) }}
              />
              <div className="avatar-name">{a.name}</div>
              <div className="avatar-sub muted">{a.flag} · {a.era}</div>
              <div className="avatar-sig">{a.signature}</div>
            </button>
          ))}
        </div>

        <div className="mc-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={save} disabled={!user}>
            💾 שמור אווטר
          </button>
          <button className="btn" onClick={onClose}>ביטול</button>
          {!user && <span className="muted" style={{ alignSelf: "center" }}>צריך להתחבר כדי לשמור</span>}
        </div>
      </div>
    </div>
  );
}

export function AvatarDisplay({ avatarId, size = 40 }: { avatarId: string; size?: number }) {
  const a = getAvatar(avatarId) || getAvatar(defaultAvatarId())!;
  return <span className="avatar-display" dangerouslySetInnerHTML={{ __html: a.svg(size) }} />;
}
