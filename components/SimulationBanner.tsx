"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

export default function SimulationBanner() {
  const sim = useStore(s => s.simConfig);
  const [, force] = useState(0);

  /* re-tick every second so the elapsed counter updates */
  useEffect(() => {
    if (!sim?.enabled) return;
    const id = setInterval(() => force(x => x + 1), 1000);
    return () => clearInterval(id);
  }, [sim?.enabled]);

  if (!sim?.enabled) return null;

  const elapsed = Math.max(0, Date.now() - sim.startedAt);
  const totalSimMs = (39 * 24 * 60 * 60 * 1000) / sim.speedMultiplier;
  const pct = Math.min(100, (elapsed / totalSimMs) * 100);

  function fmt(ms: number): string {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  }

  return (
    <div className="sim-banner">
      <div className="sim-banner-row">
        <span className="sim-banner-tag">🧪 מצב סימולציה{sim.label ? ` · ${sim.label}` : ""}</span>
        <span className="muted sim-banner-stats">
          חלף: <strong>{fmt(elapsed)}</strong> · ×{sim.speedMultiplier.toFixed(0)} מהירות
        </span>
      </div>
      <div className="sim-banner-progress">
        <div className="sim-banner-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
