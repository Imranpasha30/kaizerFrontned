import React, { useEffect, useMemo, useRef, useState } from "react";
import { parseV4Log, V4_STAGES } from "./parseV4Log";
import StageHead from "./StageHead";
import StageRail from "./StageRail";
import ActivityLog from "./ActivityLog";
import StageVisual from "./StageVisual";
import Heartbeat from "./Heartbeat";
import "./jobPipelineV4.css";

/**
 * Newsroom-style progress panel that replaces the old terminal-style
 * ProgressLog for V4 jobs.
 *
 * Props:
 *   logLines    — string[] from GET /api/jobs/:id/status/ poll
 *   status      — "pending"|"running"|"done"|"failed"|"cancelled"
 *   pct         — backend's heuristic 0..100 (kept as a fallback for legend)
 *   clips       — job.clips (used by StageVisual once the job is done)
 *   error       — status.error (string) when failed
 *   elapsedSec  — seconds since start (used for ETA estimate)
 */
export default function JobPipelineV4({
  logLines = [],
  status,
  pct,
  clips = [],
  error,
  elapsedSec = 0,
}) {
  const parsed = useMemo(
    () => parseV4Log(logLines, { status }),
    // We re-parse on log change. logLines is a fresh array on each
    // poll, so length is a stable proxy for "new content".
    [logLines.length, status]
  );

  // Heartbeat needs to know when log content last grew.
  const lastLogChangeAt = useRef(performance.now());
  const lastLen = useRef(logLines.length);
  useEffect(() => {
    if (logLines.length !== lastLen.current) {
      lastLen.current = logLines.length;
      lastLogChangeAt.current = performance.now();
    }
  }, [logLines.length]);

  const running = status === "running" || status === "pending";

  // ETA: extrapolate from elapsed + overallFrac.
  const etaText = useMemo(() => {
    if (parsed.done) return "complete";
    if (parsed.failed) return "halted";
    if (parsed.overallFrac < 0.03) return "estimating…";
    const remainingFrac = Math.max(0, 1 - parsed.overallFrac);
    const etaSec = (remainingFrac / parsed.overallFrac) * elapsedSec;
    return `~${humanEta(etaSec)} remaining`;
  }, [parsed.overallFrac, parsed.done, parsed.failed, elapsedSec]);

  const overallPct = Math.round(parsed.overallFrac * 100);
  const stage = V4_STAGES[Math.min(parsed.stageIdx, V4_STAGES.length - 1)];

  return (
    <div className="v4p-shell">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(280px,360px)] gap-0 lg:gap-2">
        {/* ── Centerpiece column ─────────────────────────── */}
        <div className="flex flex-col min-w-0">
          <StageHead
            stageIdx={parsed.stageIdx}
            stageFrac={parsed.stageFrac}
            overallFrac={parsed.overallFrac}
            done={parsed.done}
            failed={parsed.failed}
            etaText={etaText}
            outputFormat={parsed.outputFormat}
          />

          <div className="v4p-viewport">
            <StageVisual
              stageIdx={parsed.stageIdx}
              stageFrac={parsed.stageFrac}
              done={parsed.done}
              failed={parsed.failed}
              counters={parsed.counters}
              clips={clips}
              errorMsg={error}
            />
          </div>

          <div className="v4p-overall">
            <div className="v4p-overall-track">
              <div
                className={`v4p-overall-fill ${parsed.done ? "v4p-done" : ""} ${parsed.failed ? "v4p-failed" : ""}`}
                style={{ width: `${overallPct}%` }}
              />
            </div>
            <div className="v4p-overall-legend">
              <span>OVERALL PROGRESS</span>
              <span><b>{stage.label}</b> · {Math.round(parsed.stageFrac * 100)}%</span>
            </div>
          </div>
        </div>

        {/* ── Right rail ─────────────────────────────────── */}
        <div className="flex flex-col gap-2 p-3 lg:p-3 lg:pl-0 lg:pr-3 lg:pt-3 lg:pb-3 min-w-0">
          <StageRail
            stageIdx={parsed.stageIdx}
            stageFrac={parsed.stageFrac}
            failed={parsed.failed}
            counters={parsed.counters}
          />
          <ActivityLog
            activity={parsed.activity}
            running={running}
          />
          <Heartbeat
            running={running}
            lastLogChangeAt={lastLogChangeAt.current}
            stageIdx={parsed.stageIdx}
            stageFrac={parsed.stageFrac}
          />
        </div>
      </div>
    </div>
  );
}

function humanEta(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return `${h}h ${m}m`;
  }
  if (sec >= 90) return `${Math.round(sec / 60)} min`;
  if (sec >= 60) return "1 min";
  if (sec <= 5) return "few sec";
  return `${Math.ceil(sec / 5) * 5} sec`;
}
