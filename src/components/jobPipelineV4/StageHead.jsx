import React from "react";
import { V4_STAGES } from "./parseV4Log";

/** Kicker + big title + sub + giant pct/ETA — the stage centerpiece header. */
export default function StageHead({ stageIdx, stageFrac, overallFrac, done, failed, etaText, outputFormat = "both" }) {
  const stage = V4_STAGES[Math.min(stageIdx, V4_STAGES.length - 1)];
  const pct = Math.round(Math.max(0, Math.min(1, overallFrac)) * 100);

  const kickerLabel = failed
    ? "Failed"
    : done
      ? "Done"
      : `Stage ${String(stage.n).padStart(2, "0")}/03 · In progress`;

  // Title/sub reflect what this job actually produces — a shorts-only job
  // (Reel / Short) makes no full video, a full-only job makes no shorts.
  const doneTitle = outputFormat === "shorts-only" ? "Shorts ready"
                  : outputFormat === "full-only"   ? "Full Video ready"
                  :                                  "Full Video + Shorts ready";
  const doneSub = outputFormat === "shorts-only"
    ? "Shorts encoded. Open the Canvas Editor or Export All from the header."
    : outputFormat === "full-only"
      ? "Full Video encoded. Open the Canvas Editor or Export All from the header."
      : "Full Video and shorts encoded. Open the Canvas Editor or Export All from the header.";

  const title = done
    ? doneTitle
    : failed
      ? "Pipeline failed"
      : stage.label;

  const sub = done
    ? doneSub
    : failed
      ? "The pipeline subprocess raised before all stages completed. Inspect the activity log for the failing line."
      : stage.sub;

  return (
    <div className="v4p-stagehead">
      <div className="min-w-0">
        <div className="v4p-kicker">
          <span className="v4p-num">{kickerLabel}</span>
        </div>
        <div className="v4p-stage-title">{title}</div>
        <div className="v4p-stage-sub">{sub}</div>
      </div>
      <div>
        <div className="v4p-pct">
          {pct}<small>%</small>
        </div>
        <div className="v4p-eta">{etaText}</div>
      </div>
    </div>
  );
}
