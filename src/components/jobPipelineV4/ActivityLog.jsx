import React from "react";
import { Activity } from "lucide-react";

/**
 * Activity log — chip-prefixed log lines.
 * `activity` is newest-first (from parseV4Log). We render up to `max`
 * rows and cap the panel height in CSS with a top-fade mask.
 */
export default function ActivityLog({ activity = [], max = 60, running = false }) {
  const rows = activity.slice(0, max);
  return (
    <div className="v4p-panel">
      <div className="v4p-panel-hd">
        <span className="v4p-panel-ico"><Activity size={14} /></span>
        <span className="v4p-panel-title">Live activity</span>
        {running && <span className="v4p-live-dot" style={{ marginLeft: "auto" }} />}
      </div>
      <div className="v4p-log-body">
        {rows.length === 0 ? (
          <div className="v4p-log-line">
            <span className="v4p-tag">idle</span>
            <span className="v4p-msg" style={{ opacity: 0.6 }}>
              Waiting for the pipeline to emit its first marker…
            </span>
          </div>
        ) : (
          rows.map((l) => (
            <div key={l.id} className="v4p-log-line">
              <span className={`v4p-tag ${l.kind || ""}`}>{l.tag}</span>
              <span className="v4p-msg">{l.msg}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
