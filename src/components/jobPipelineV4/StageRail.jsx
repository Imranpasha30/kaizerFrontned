import React, { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import { V4_STAGES } from "./parseV4Log";

// Rotating sub-task tag shown under the active stage. Pulled from
// orchestrator behaviour: what's actually happening in each stage.
const SUBTASKS = {
  trim: [
    "ingesting source video",
    "pre-selecting full video images",
    "atomic trim",
    "binding clip metadata",
  ],
  canvas: [
    "building canvas layout",
    "ingesting image pool",
    "planning shorts",
    "trimming shorts",
    "generating SEO",
    "writing canvas.json",
  ],
  render: [
    "spinning up ffmpeg",
    "rendering full video (nvenc)",
    "rendering shorts",
    "muxing audio",
    "packaging outputs",
  ],
};

const STATE_FROM_IDX = (i, stageIdx, failed) => {
  if (failed && i === stageIdx) return "failed";
  if (i < stageIdx) return "done";
  if (i === stageIdx) return "active";
  return "pending";
};

/** Right-rail vertical 3-step pipeline. */
export default function StageRail({ stageIdx, stageFrac, failed, counters }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2200);
    return () => clearInterval(id);
  }, []);

  // Counters mirror what the user can confirm visually in the log.
  const counterLine = (key) => {
    if (key === "trim" && counters?.imagesPreselected > 0)
      return `${counters.imagesPreselected} images pre-selected`;
    if (key === "canvas") {
      if (counters?.shortsTrimmed > 0 && counters?.shortsPlanned > 0)
        return `${counters.shortsTrimmed}/${counters.shortsPlanned} shorts trimmed`;
      if (counters?.shortsPlanned > 0)
        return `${counters.shortsPlanned} shorts planned`;
    }
    if (key === "render") {
      const parts = [];
      if (counters?.bulletinRendered) parts.push("full video ✓");
      if (counters?.shortsRendered > 0) parts.push(`${counters.shortsRendered} short${counters.shortsRendered === 1 ? "" : "s"}`);
      if (parts.length) return parts.join(" · ");
    }
    return null;
  };

  return (
    <div className="v4p-panel">
      <div className="v4p-panel-hd">
        <span className="v4p-panel-ico"><GitBranch size={14} /></span>
        <span className="v4p-panel-title">Pipeline</span>
        <span className="v4p-panel-title" style={{ marginLeft: "auto", color: "var(--v4p-tx-faint)" }}>
          {String(Math.min(stageIdx + 1, V4_STAGES.length)).padStart(2, "0")} / {String(V4_STAGES.length).padStart(2, "0")}
        </span>
      </div>
      <div className="v4p-rail-body">
        {V4_STAGES.map((s, i) => {
          const state = STATE_FROM_IDX(i, stageIdx, failed);
          const subs = SUBTASKS[s.key] || [];
          const sub = subs[tick % Math.max(1, subs.length)] || "";
          const counterText = counterLine(s.key);
          const pct = state === "done" ? 100
                     : state === "active" ? Math.round(stageFrac * 100)
                     : 0;
          return (
            <div key={s.key} className={`v4p-stage-row v4p-${state}`}>
              <div className="v4p-stage-node">
                {state === "done" ? "✓" : state === "failed" ? "!" : s.n}
              </div>
              <div className="min-w-0">
                <div className="v4p-stage-nm">{s.label}</div>
                <div className="v4p-stage-tk">
                  {state === "active"
                    ? (counterText || sub)
                    : state === "done"
                      ? (counterText || "complete")
                      : state === "failed"
                        ? "halted"
                        : "queued"}
                </div>
              </div>
              <div className="v4p-stage-amt">
                {state === "pending" ? "—" : `${pct}%`}
              </div>
              {state === "active" && (
                <div className="v4p-stage-mini"><i style={{ width: `${pct}%` }} /></div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
