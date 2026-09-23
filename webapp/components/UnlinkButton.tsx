"use client";

import { useState } from "react";
import { useRouter } from "@/src/i18n/navigation";
import type { Dict } from "@/lib/i18n";

type Props = {
  dict: Dict;
  onUnlinked?: () => void;
};

export default function UnlinkButton({ dict, onUnlinked }: Props) {
  const d = dict.dashboard;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function unlink() {
    setBusy(true);
    setError(false);
    try {
      const r = await fetch("/api/wizard/unlink", { method: "POST" });
      if (!r.ok) {
        setBusy(false);
        setError(true);
        return;
      }
      if (onUnlinked) onUnlinked();
      else router.push("/wizard?again=1");
    } catch {
      setBusy(false);
      setError(true);
    }
  }

  return (
    <div>
      <button type="button" onClick={() => void unlink()} disabled={busy}>
        {busy ? d.unlinking : d.unlink}
      </button>
      {error && <p className="warn" role="alert">{d.unlinkError}</p>}
    </div>
  );
}
