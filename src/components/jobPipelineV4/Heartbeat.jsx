import React, { useEffect, useState } from "react";

/**
 * Server-link heartbeat footer.
 *
 * Props:
 *   running        — pipeline is running (animates EQ bars)
 *   lastLogChangeAt — performance.now() the parent recorded when
 *                     logLines.length last changed. Updates this
 *                     value drives the "last update Xs ago" display.
 */
export default function Heartbeat({ running, lastLogChangeAt, stageIdx, stageFrac }) {
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [running]);

  const since = lastLogChangeAt
    ? Math.max(0, (performance.now() - lastLogChangeAt) / 1000)
    : 0;
  const sinceText = since < 0.5 ? "just now" : `${since.toFixed(1)}s ago`;

  const linkLabel = running ? "healthy" : "idle";
  const stageNum = Math.min((stageIdx ?? 0) + 1, 3);
  const stagePct = Math.round((stageFrac ?? 0) * 100);

  return (
    <div className={`v4p-heartbeat ${running ? "" : "v4p-idle"}`}>
      <span className="v4p-bars"><i /><i /><i /><i /></span>
      <span>server link · <b>{linkLabel}</b></span>
      <span className="v4p-since">
        last update <b>{sinceText}</b> · stage {stageNum}@{stagePct}%
      </span>
    </div>
  );
}
