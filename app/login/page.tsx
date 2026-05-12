"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginWithGoogle, loginWithEmail, loginWithIdentifier, registerWithEmail } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function withCatch(fn: () => Promise<any>) {
    setBusy(true); setError(null);
    try { await fn(); router.push("/"); }
    catch (e: any) { setError(e.message || "שגיאה לא ידועה"); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: 14, padding: 30, maxWidth: 420, width: "100%",
      }}>
        <h1 style={{ marginTop: 0 }}>⚽ מונדיאל 2026</h1>
        <p className="muted">{mode === "signin" ? "כניסה לחשבון" : "יצירת חשבון חדש"}</p>

        <button className="btn btn-primary" style={{ width: "100%", marginBottom: 12 }}
                disabled={busy}
                onClick={() => withCatch(loginWithGoogle)}>
          🅖 כניסה עם Google
        </button>

        <div style={{ textAlign: "center", margin: "12px 0", color: "var(--text-muted)" }}>או</div>

        <input className="flt-input" type="text" placeholder="אימייל או שם משתמש" value={email}
               autoCapitalize="off" autoCorrect="off" spellCheck={false}
               onChange={e => setEmail(e.target.value)}
               style={{ width: "100%", padding: 10, borderRadius: 10, marginBottom: 8,
                        background: "var(--bg-elev)", border: "1px solid var(--border)", color: "var(--text)" }} />
        <input type="password" placeholder="סיסמה" value={password}
               onChange={e => setPassword(e.target.value)}
               style={{ width: "100%", padding: 10, borderRadius: 10, marginBottom: 8,
                        background: "var(--bg-elev)", border: "1px solid var(--border)", color: "var(--text)" }} />

        <button className="btn btn-primary" style={{ width: "100%", marginBottom: 8 }}
                disabled={busy || !email || !password}
                onClick={() => withCatch(() => mode === "signin"
                  ? loginWithIdentifier(email, password)
                  : registerWithEmail(email, password))}>
          {mode === "signin" ? "כניסה" : "הרשמה"}
        </button>

        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button className="btn btn-small" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "אין לי חשבון — הרשמה" : "כבר יש לי חשבון — כניסה"}
          </button>
        </div>

        {error && <p style={{ color: "var(--red)", marginTop: 12, fontSize: 13 }}>{error}</p>}
        <p style={{ marginTop: 18, fontSize: 12 }}>
          <Link href="/" className="muted">← חזרה ללוח המשחקים</Link>
        </p>
      </div>
    </div>
  );
}
