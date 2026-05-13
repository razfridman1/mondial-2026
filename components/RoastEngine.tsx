"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { getFirebase } from "@/lib/firebase";
import { AvatarDisplay } from "./AvatarPicker";

interface Member { uid: string; displayName: string; avatarId: string; }

export default function RoastEngine() {
  const user = useStore(s => s.user);
  const profile = useStore(s => s.profile);
  const aiBlocked = !!profile?.aiBlocked;
  const currentGroupId = useStore(s => s.currentGroupId);
  const [members, setMembers] = useState<Member[]>([]);
  const [target, setTarget] = useState<string>("self");   // "self" | uid | "all"
  const [markdown, setMarkdown] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Load group members for the picker */
  useEffect(() => {
    if (!user || !currentGroupId) { setMembers([]); return; }
    (async () => {
      try {
        const token = await getFirebase().auth!.currentUser!.getIdToken();
        const r = await fetch(`/api/group-predictions?groupId=${currentGroupId}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!r.ok) return;
        const data = await r.json();
        setMembers((data.members || []).filter((m: Member) => m.uid !== user.uid));
      } catch {}
    })();
  }, [user?.uid, currentGroupId]);

  async function roast() {
    if (!user) return;
    if (aiBlocked) { setError("השימוש בכלי ה-AI נחסם עבור המשתמש שלך על-ידי מנהל המערכת."); return; }
    setBusy(true); setError(null); setMarkdown("");
    try {
      const token = await getFirebase().auth!.currentUser!.getIdToken();
      let body: any;
      if (target === "self")       body = { mode: "self", groupId: currentGroupId };
      else if (target === "all")    body = { mode: "all",  groupId: currentGroupId };
      else                          body = { mode: "friend", targetUid: target, groupId: currentGroupId };

      const r = await fetch("/api/roast", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.message || data.error || "שגיאה"); return; }
      setMarkdown(data.markdown || "");
    } finally { setBusy(false); }
  }

  return (
    <section className="ai-section">
      <h3>🃏 מנוע עקיצות</h3>
      <p className="muted">
        תן לבינה המלאכותית לכתוב עקיצה ספורטיבית. בחר את עצמך, חבר ספציפי, או "כולם ביחד".
        העקיצה תופיע לכל חברי הקבוצה בלוח הצד.
      </p>

      <div className="sim-row" style={{ marginTop: 10 }}>
        <label>🎯 מי לעקוץ:</label>
        <select value={target} onChange={e => setTarget(e.target.value)} disabled={busy}>
          <option value="self">🪞 את עצמי</option>
          {members.length > 0 && <option value="all">👥 כל החברים בקבוצה ({members.length})</option>}
          {members.map(m => (
            <option key={m.uid} value={m.uid}>👤 {m.displayName}</option>
          ))}
        </select>
      </div>

      {!currentGroupId && (
        <p className="muted" style={{ fontSize: 12 }}>
          טיפ: בלשונית "דירוג חברים" בחר קבוצה כדי לעקוץ חברים ספציפיים או את כולם ביחד.
        </p>
      )}

      {aiBlocked && (
        <p className="pred-msg is-locked" style={{ marginTop: 8 }}>
          🚫 השימוש בכלי ה-AI נחסם עבור המשתמש שלך על-ידי מנהל המערכת.
        </p>
      )}

      <div className="mc-actions" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" onClick={roast} disabled={busy || !user || aiBlocked}>
          {busy ? "…כותב" : "🔥 צור עקיצה"}
        </button>
        {!user && <span className="muted">צריך להתחבר</span>}
      </div>

      {error && <p className="pred-msg is-locked">{error}</p>}

      {markdown && (
        <div className="roast-output">
          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>✓ נשלחה לכל חברי הקבוצה דרך פיד הצד</div>
          {markdown}
        </div>
      )}
    </section>
  );
}
