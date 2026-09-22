"use client";

import { useEffect, useState } from "react";

export default function UtcClock() {
  const [now, setNow] = useState<{ h: string; m: string; s: string } | null>(null);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const iso = d.toISOString();
      setNow({ h: iso.slice(11, 13), m: iso.slice(14, 16), s: iso.slice(17, 19) });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="clock" aria-label="UTC time">
      <time suppressHydrationWarning>
        {now ? `${now.h}:${now.m}:${now.s}` : "--:--:--"}
      </time>
      <span className="tz">UTC</span>
    </span>
  );
}