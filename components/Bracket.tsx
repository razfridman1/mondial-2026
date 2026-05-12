"use client";
import { useMemo } from "react";
import { MATCHES, TEAMS } from "@/lib/data";
import { useStore } from "@/lib/store";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";
import { effMatch } from "@/lib/sim";

const STAGES = ["R32","R16","QF","SF","FINAL"] as const;
const TITLES: Record<string, string> = { R32:"שלב 32", R16:"שלב 16", QF:"רבע גמר", SF:"חצי גמר", FINAL:"הגמר" };

export default function Bracket() {
  const overrides = useStore(s => s.overrides);
  const simConfig = useStore(s => s.simConfig);
  const matches = useMemo(() => MATCHES.map(m => effMatch(m, overrides[m.id], simConfig)), [overrides, simConfig]);
  return (
    <div className="bracket">
      {STAGES.map(s => (
        <div key={s} className="br-col">
          <h4 className="br-title">{TITLES[s]}</h4>
          {matches.filter(m => m.stage === s).map(m => (
            <div key={m.id} className="br-match">
              <div className="br-team">{TEAMS[m.home]?.flag || "❓"} {TEAMS[m.home]?.name || m.home}</div>
              <div className="br-team">{TEAMS[m.away]?.flag || "❓"} {TEAMS[m.away]?.name || m.away}</div>
              <div className="br-time muted">{formatIsraelDate(m.utc, { short: true })} · {formatIsraelTime(m.utc)}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
