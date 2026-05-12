"use client";
import { useState } from "react";
import { LEGENDS } from "@/lib/legends";

/* =====================================================================
 * Fixed full-viewport background collage of 30 football legends.
 * - Loads images from Wikimedia Commons (hotlinking-allowed).
 * - Falls back to a silhouette + jersey + surname on any image error.
 * - The overlay gradient keeps content fully readable above it.
 * ===================================================================*/

export default function LegendsBackground() {
  return (
    <div className="legends-bg" aria-hidden="true">
      <div className="legends-grid">
        {LEGENDS.map((l, i) => <Tile key={i} legend={l} />)}
      </div>
      <div className="legends-overlay" />
    </div>
  );
}

function Tile({ legend }: { legend: typeof LEGENDS[number] }) {
  const [errored, setErrored] = useState(false);
  return (
    <div className="legends-tile" title={`${legend.name} · ${legend.flag} ${legend.era}`}>
      {!errored ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={legend.imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
        />
      ) : (
        <div className="legends-fallback">
          <div className="legends-jersey">{legend.jersey}</div>
          <div className="legends-flag">{legend.flag}</div>
          <div className="legends-surname">{legend.surname}</div>
        </div>
      )}
      <div className="legends-tag">
        <span>{legend.flag}</span>
        <span>{legend.surname}</span>
        <span className="legends-num">{legend.jersey}</span>
      </div>
    </div>
  );
}
