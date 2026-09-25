"use client";

// SignOutButton — the header's sign-out action. It asks /api/me so the button only
// appears once a session cookie actually exists (the landing page shares this chrome),
// then POSTs /api/auth/logout and hard-navigates home so no stale state survives.
import { useEffect, useState } from "react";

export default function SignOutButton({ label }: { label: string }) {
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/me")
      .then((r) => r.json())
      .then((b) => {
        if (live && b?.ok) setSignedIn(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!signedIn) return null;

  return (
    <button
      type="button"
      className="signout"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } finally {
          window.location.assign("/");
        }
      }}
    >
      {busy ? "…" : label}
    </button>
  );
}