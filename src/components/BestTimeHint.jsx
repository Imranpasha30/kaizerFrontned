import React, { useEffect, useState } from "react";
import { api } from "../api/client";

/** Learned best-upload-time hint (SEO learning, measured from the channel's
 * real history in IST). One-click applies the NEXT occurrence of that hour
 * to a schedule picker via onApply(isoLocalString). Renders nothing when no
 * channel has learned hours yet — no fake suggestions. Shared by
 * PublishModal + BulkPublishModal. */
export default function BestTimeHint({ onApply }) {
  const [hint, setHint] = useState(null);
  useEffect(() => {
    let alive = true;
    api.seoLearning().then((d) => {
      if (!alive) return;
      const ch = (d?.channels || []).find(
        (c) => (c.policy?.best_hours || []).length > 0);
      if (ch) setHint({ name: ch.channel_name, hours: ch.policy.best_hours });
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!hint) return null;
  const apply = (h) => {
    const d = new Date();
    if (d.getHours() >= h) d.setDate(d.getDate() + 1);   // next occurrence
    d.setHours(h, 0, 0, 0);
    const pad = (n) => String(n).padStart(2, "0");
    onApply(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:00`);
  };
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-sky-300 flex-wrap">
      <span title={`Measured from ${hint.name}'s real upload history (IST)`}>
        ⏰ Learned best time{hint.hours.length > 1 ? "s" : ""}:
      </span>
      {hint.hours.map((h) => (
        <button key={h} type="button" onClick={() => apply(h)}
          className="px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 hover:bg-sky-500/20">
          {String(h).padStart(2, "0")}:00 IST — apply
        </button>
      ))}
    </div>
  );
}
