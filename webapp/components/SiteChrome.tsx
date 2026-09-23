"use client";

import { useState } from "react";

import LanguageSwitcher from "@/components/LanguageSwitcher";
import UtcClock from "@/components/UtcClock";
import { Link, UTC_NOTE, type Dict } from "@/lib/i18n";
import { usePathname } from "@/src/i18n/navigation";

export default function SiteChrome({
  children,
  dict,
}: {
  children: React.ReactNode;
  dict: Dict;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = [
    { href: "/dashboard", label: dict.nav.dashboard },
    { href: "/wizard", label: dict.nav.wizard },
    { href: "/master", label: dict.nav.master },
    { href: "/info", label: dict.nav.info },
  ];
  const active = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`) ? "active" : "";

  return (
    <>
      <header className="shell">
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <img src="/images/logo.png" alt="" />
          <span>
            <span className="lol">LOL</span>
            <span className="title-gold">bubbler</span>
          </span>
        </Link>
        <nav>
          {items.map((n) => (
            <Link key={n.href} href={n.href} className={active(n.href)}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="shell-end">
          <UtcClock />
          <span className="utc-note">{UTC_NOTE}</span>
          <LanguageSwitcher />
          <button
            type="button"
            className="menu-btn"
            aria-label="menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </header>
      <div className={`mobile-menu${open ? " open" : ""}`}>
        {items.map((n) => (
          <Link key={n.href} href={n.href} className={active(n.href)} onClick={() => setOpen(false)}>
            {n.label}
          </Link>
        ))}
      </div>
      <main>{children}</main>
      <footer className="site-foot">
        <p>{dict.info.privateBody}</p>
        <p className="sig">ALLIANCE LOL · KEEP THE BUBBLES UP</p>
      </footer>
      <nav className="bottom-nav">
        {items.map((n) => (
          <Link key={n.href} href={n.href} className={active(n.href)}>
            {n.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
