import React, { useEffect, useRef } from "react";

export default function ProgressLog({ lines = [], pct = 0, status }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines.length]);

  const statusColor = {
    running: "text-yellow-400",
    done:    "text-green-400",
    failed:  "text-red-400",
    pending: "text-gray-400",
  }[status] || "text-gray-400";

  return (
    <div className="card p-3 sm:p-4 flex flex-col gap-3">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-500 rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-xs font-bold w-16 text-right tabular-nums ${statusColor}`}>
          {status === "done" ? "Done" :
           status === "failed" ? "Failed" :
           status === "running" ? `${pct}%` : "Pending"}
        </span>
      </div>

      {/* Log terminal \u2014 backlog item 98: bigger panel + finer color
          coding so the operator can scan stage / overlay / cost
          lines independently. */}
      <div
        ref={ref}
        className="bg-black rounded p-3 h-72 sm:h-80 lg:h-96 overflow-y-auto font-mono text-[11px] sm:text-xs leading-5 text-gray-400"
      >
        {lines.length === 0 ? (
          <span className="text-gray-600">Waiting for pipeline to start...</span>
        ) : (
          lines.map((line, i) => {
            const lower = line.toLowerCase();
            const isError   = lower.includes("error") || lower.includes("failed") || line.startsWith("\u2717");
            const isWarning = lower.includes("warn") || lower.includes("qa warning");
            const isDone    = lower.includes(" done ") || line.startsWith("\u2713");
            // V1's "[provider] generated img_X.jpg in Nms ($X.XXX)" cost
            // ledger style; V2 emits "[openai]/[gemini]/[deepgram]" prefixes
            // and "$X.XX" suffix lines. Color them cyan so spend stands out.
            const isCost = /\$\d+\.\d/.test(line) || /\[(openai|gemini|deepgram|pexels|cse|ddg)\]/i.test(line);
            // Sub-detail lines (indented "  [short N] ...", "  [cut N] ...",
            // "  [image] ...") get a softer gray so the eye flows past
            // them to the section headers (STEP).
            const isSubDetail = /^\s{2,}\[/.test(line);
            const isStep    = /STEP/.test(line);
            return (
              <div
                key={i}
                className={
                  isError     ? "text-red-400 font-semibold" :
                  isWarning   ? "text-amber-400" :
                  isCost      ? "text-cyan-300" :
                  isDone      ? "text-green-400" :
                  isStep      ? "text-yellow-300 font-medium" :
                  isSubDetail ? "text-gray-500" :
                                "text-gray-300"
                }
              >
                {line}
              </div>
            );
          })
        )}
        {status === "running" && (
          <span className="animate-pulse text-accent">{"\u258C"}</span>
        )}
      </div>
    </div>
  );
}
