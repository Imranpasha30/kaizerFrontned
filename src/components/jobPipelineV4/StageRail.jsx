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

/** One live substep row: ✓ done · pulsing ● active · dim ○ pending. */
function SubstepRow({ step }) {
  const mark = step.state === "done" ? "✓" : step.state === "active" ? "●" : "○";
  const color = step.state === "done" ? "var(--v4p-ok, #34d399)"
              : step.state === "active" ? "var(--v4p-accent, #f59e0b)"
              : "var(--v4p-tx-faint, #6b7280)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6,
                  fontSize: 11, lineHeight: "18px", color,
                  opacity: step.state === "pending" ? 0.55 : 1 }}>
      <span style={{ width: 12, textAlign: "center",
                     animation: step.state === "active"
                       ? "v4p-pulse 1.2s ease-in-out infinite" : "none" }}>
        {mark}
      </span>
      <span className="truncate">{step.label}</span>
    </div>
  );
}

/** Right-rail vertical 3-step pipeline (with live substeps under the
 * active stage so a long step never looks stuck). */
export default function StageRail({ stageIdx, stageFrac, failed, counters, substeps }) {
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
          // Real substeps parsed from the live log; only shown expanded on
          // the stage the pipeline is actually in (or halted at) so the
          // user always sees WHAT the engine is doing, not just a spinner.
          const stageSubs = (substeps && substeps[s.key]) || [];
          const showSubs = (state === "active" || state === "failed")
            && stageSubs.length > 0;
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
                {showSubs && (
                  <div style={{ marginTop: 4, display: "flex",
                                flexDirection: "column", gap: 1 }}>
                    {stageSubs.map((st) => (
                      <SubstepRow key={st.key} step={st} />
                    ))}
                  </div>
                )}
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
