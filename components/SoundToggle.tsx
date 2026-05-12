"use client";
import { useEffect, useState } from "react";
import { playSound, soundEnabled, setSoundEnabled } from "@/lib/sound";

export default function SoundToggle() {
  const [on, setOn] = useState<boolean>(false);
  useEffect(() => { setOn(soundEnabled()); }, []);

  function toggle() {
    const next = !on;
    setSoundEnabled(next);
    setOn(next);
    if (next) playSound("notify");
  }

  return (
    <button className={`btn btn-small ${on ? "btn-on" : ""}`} onClick={toggle}
            title={on ? "השתק" : "הפעל אפקטים קוליים"}>
      {on ? "🔊 צלילים" : "🔇 שקט"}
    </button>
  );
}
