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
    <div className="card p-4 flex flex-col gap-3">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-500 rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-xs font-bold w-16 text-right ${statusColor}`}>
          {status === "done" ? "✓ Done" :
           status === "failed" ? "✗ Failed" :
           status === "running" ? `${pct}%` : "Pending"}
        </span>
      </div>

      {/* Log terminal */}
      <div
        ref={ref}
        className="bg-black rounded p-3 h-64 overflow-y-auto font-mono text-xs leading-5 text-gray-300"
      >
        {lines.length === 0 ? (
          <span className="text-gray-600">Waiting for pipeline to start…</span>
        ) : (
          lines.map((line, i) => {
            const isError = line.toLowerCase().includes("error") || line.startsWith("✗");
            const isDone  = line.startsWith("✓");
            const isStep  = /^\s*\[/.test(line);
            return (
              <div
                key={i}
                className={
                  isError ? "text-red-400" :
                  isDone  ? "text-green-400" :
                  isStep  ? "text-yellow-300" : ""
                }
              >
                {line}
              </div>
            );
          })
        )}
        {status === "running" && (
          <span className="animate-pulse text-accent">▌</span>
        )}
      </div>
    </div>
  );
}
