import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Terminal, RefreshCw, Pause, Play, Trash2, Search, ArrowDownToLine,
  Copy, Check, Download,
} from "lucide-react";
import { adminApi } from "../api/client";
import Button from "../components/ui/Button";
import {
  Page, PageHeader, DashCard, FilterButton, ErrorBanner, LiveDot,
} from "./admin/_primitives";

// ─── Constants ───────────────────────────────────────────────────────

const MAX_LINES = 4000;
const BACKLOG   = 500;

const LEVELS = [
  { key: "all",     label: "All" },
  { key: "error",   label: "Errors" },
  { key: "warning", label: "Warnings" },
  { key: "info",    label: "Info" },
];

const LEVEL_COLOR = {
  error:    "#fca5a5",
  critical: "#ef4444",
  warning:  "#fbbf24",
  warn:     "#fbbf24",
  info:     "#cbd5e1",
  debug:    "#64748b",
  stdout:   "#94a3b8",
  stderr:   "#fda4af",
};

function fmtTs(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

// ─── Main ────────────────────────────────────────────────────────────

export default function AdminLogs() {
  const [lines, setLines]         = useState([]);
  const [paused, setPaused]       = useState(false);
  const [filterLevel, setLevel]   = useState("all");
  const [search, setSearch]       = useState("");
  const [autoScroll, setAuto]     = useState(true);
  const [error, setError]         = useState("");
  const [streaming, setStreaming] = useState(false);
  const [copied, setCopied]       = useState(false);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const scrollerRef = useRef(null);
  const seenIdsRef  = useRef(new Set());

  const append = useCallback((entries) => {
    setLines((prev) => {
      const next = prev.slice();
      let added = 0;
      for (const e of entries) {
        if (e?.id != null) {
          if (seenIdsRef.current.has(e.id)) continue;
          seenIdsRef.current.add(e.id);
        }
        next.push(e);
        added++;
      }
      if (next.length > MAX_LINES) {
        const drop = next.length - MAX_LINES;
        for (let i = 0; i < drop; i++) {
          const removed = next[i];
          if (removed?.id != null) seenIdsRef.current.delete(removed.id);
        }
        return next.slice(drop);
      }
      return added ? next : prev;
    });
  }, []);

  const loadBacklog = useCallback(async () => {
    try {
      const d = await adminApi.recentLogs(BACKLOG);
      seenIdsRef.current = new Set((d?.lines || []).map((e) => e.id));
      setLines(d?.lines || []);
      setError("");
    } catch (e) {
      setError(e?.message || "Failed to load log backlog");
    }
  }, []);

  useEffect(() => { loadBacklog(); }, [loadBacklog]);

  useEffect(() => {
    let stop = null;
    setStreaming(true);
    stop = adminApi.streamLogs({
      onEvent: (entry) => {
        if (pausedRef.current) return;
        append([entry]);
      },
      onError: (e) => {
        setError(`Live stream error: ${e?.message || e}`);
        setStreaming(false);
        setTimeout(() => loadBacklog(), 3000);
      },
    });
    return () => {
      setStreaming(false);
      try { stop?.(); } catch {}
    };
  }, [append, loadBacklog]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((e) => {
      if (filterLevel !== "all" && e.level !== filterLevel) {
        if (!(filterLevel === "warning" && e.level === "warn")) return false;
      }
      if (q && !`${e.source} ${e.line}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [lines, filterLevel, search]);

  useEffect(() => {
    if (!autoScroll || !scrollerRef.current) return;
    const el = scrollerRef.current;
    el.scrollTop = el.scrollHeight;
  }, [filtered.length, autoScroll]);

  const copyVisible = useCallback(async () => {
    const text = filtered.map((e) => `${e.ts} ${e.level.padEnd(7)} ${e.source} ${e.line}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Clipboard write blocked — check browser permissions");
    }
  }, [filtered]);

  const downloadVisible = useCallback(() => {
    const text = filtered.map((e) => `${e.ts}\t${e.level}\t${e.source}\t${e.line}`).join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `kaizer-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.log`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [filtered]);

  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, info: 0, total: lines.length };
    for (const e of lines) {
      if (e.level === "error" || e.level === "critical") c.error++;
      else if (e.level === "warning" || e.level === "warn") c.warning++;
      else if (e.level === "info" || e.level === "stdout") c.info++;
    }
    return c;
  }, [lines]);

  return (
    <Page>
      <PageHeader
        eyebrow="Live server output"
        title="Logs / terminal tail"
        accent="cyan"
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            <span>{filtered.length} of {lines.length} lines</span>
            <LiveDot state={streaming ? "live" : "down"} label={streaming ? "streaming" : "disconnected"} />
            {paused && <span style={{ color: "var(--adm-warning)" }}>· ⏸ paused (new lines discarded)</span>}
          </span>
        }
        actions={
          <>
            <Button variant="ghost" size="sm" leftIcon={<RefreshCw size={12} />} onClick={loadBacklog}>
              Reload
            </Button>
            <FilterButton
              icon={paused ? Play : Pause}
              active={paused}
              onClick={() => setPaused((v) => !v)}
            >
              {paused ? "Resume" : "Pause"}
            </FilterButton>
            <FilterButton icon={Trash2} onClick={() => { setLines([]); seenIdsRef.current = new Set(); }}>
              Clear
            </FilterButton>
            <FilterButton icon={copied ? Check : Copy} onClick={copyVisible}>
              {copied ? "Copied" : "Copy"}
            </FilterButton>
            <FilterButton icon={Download} onClick={downloadVisible}>
              Export
            </FilterButton>
          </>
        }
      />

      <ErrorBanner error={error} onDismiss={() => setError("")} />

      {/* Filter bar */}
      <DashCard className="!p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="adm-range" role="tablist">
            {LEVELS.map((l) => (
              <button
                key={l.key}
                type="button"
                role="tab"
                aria-selected={filterLevel === l.key}
                onClick={() => setLevel(l.key)}
                className={`adm-range__btn ${filterLevel === l.key ? "is-active" : ""}`}
              >
                {l.label}
                {l.key === "error"   && counts.error   > 0 && <span className="ml-1.5 tabular-nums" style={{ opacity: 0.7 }}>{counts.error}</span>}
                {l.key === "warning" && counts.warning > 0 && <span className="ml-1.5 tabular-nums" style={{ opacity: 0.7 }}>{counts.warning}</span>}
                {l.key === "all"     && counts.total   > 0 && <span className="ml-1.5 tabular-nums" style={{ opacity: 0.7 }}>{counts.total}</span>}
              </button>
            ))}
          </div>

          <div className="flex-1 relative min-w-[220px]">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--adm-text-5)" }} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="filter by text or source (e.g. uvicorn.access, /api/admin)"
              className="w-full pl-8 pr-3 py-1.5 rounded text-xs"
              style={{
                background: "var(--adm-surface)",
                border: "1px solid var(--adm-border)",
                color: "var(--adm-text)",
              }}
            />
          </div>

          <label className="flex items-center gap-1.5 text-[11px] cursor-pointer select-none" style={{ color: "var(--adm-text-3)" }}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAuto(e.target.checked)}
              style={{ accentColor: "var(--adm-violet)" }}
            />
            <ArrowDownToLine size={11} /> Auto-scroll
          </label>
        </div>
      </DashCard>

      {/* Terminal */}
      <div
        ref={scrollerRef}
        className="rounded-lg font-mono text-[11px] leading-snug overflow-y-auto overflow-x-auto"
        style={{
          background: "#070b14",
          border: "1px solid var(--adm-border)",
          minHeight: 400,
          flex: 1,
          maxHeight: "calc(100vh - 22rem)",
          scrollbarWidth: "thin",
        }}
      >
        {filtered.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs" style={{ color: "var(--adm-text-5)", minHeight: 200 }}>
            {lines.length === 0 ? "Waiting for log output…" : "No lines match the current filter."}
          </div>
        ) : (
          <div className="px-3 py-2 space-y-0.5 min-w-max">
            {filtered.map((e) => (
              <div
                key={e.id ?? `${e.ts}-${e.line.slice(0, 20)}`}
                className="flex items-baseline gap-2 px-1 -mx-1 rounded"
                style={{ transition: "background 120ms" }}
                onMouseEnter={(ev) => (ev.currentTarget.style.background = "rgba(255,255,255,0.025)")}
                onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}
              >
                <span className="tabular-nums shrink-0 select-none" style={{ color: "var(--adm-text-5)" }}>{fmtTs(e.ts)}</span>
                <span
                  className="uppercase text-[9px] font-bold tabular-nums shrink-0 w-12"
                  style={{ color: LEVEL_COLOR[e.level] || "var(--adm-text-3)" }}
                >
                  {e.level}
                </span>
                <span className="shrink-0 truncate max-w-[160px]" style={{ color: "var(--adm-cyan)" }} title={e.source}>
                  {e.source}
                </span>
                <span className="flex-1 whitespace-pre-wrap break-all" style={{ color: LEVEL_COLOR[e.level] || "var(--adm-text)" }}>
                  {e.line}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-[10px] text-center" style={{ color: "var(--adm-text-5)" }}>
        Ring buffer · max {MAX_LINES} lines in-browser · backend keeps last 2000 lines in memory
      </div>
    </Page>
  );
}
