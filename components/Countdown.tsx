"use client";
import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/utils";

export default function Countdown({ utc, className }: { utc: string; className?: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className={className}>{formatCountdown(utc)}</span>;
}
