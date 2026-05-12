"use client";
import { useEffect } from "react";
import { bootstrap, useStore } from "@/lib/store";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const loading = useStore(s => s.loadingAuth);
  useEffect(() => { bootstrap(); }, []);
  if (loading) {
    return (
      <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", color:"#9aa3c7" }}>
        ⚽ טוען את מונדיאל 2026…
      </div>
    );
  }
  return <>{children}</>;
}
