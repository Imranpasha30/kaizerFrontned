/* The Live Pipeline Map: every stage of live streaming, as a graph, from real state.
 *
 * The layout, the node cards and the wires come from the planning rig
 * (live-rig.html). The difference is the entire point of this tab: the rig
 * SIMULATED a day so its shape could be argued about, and this reports the one
 * actually happening. There are no modelled numbers here. Where something cannot
 * be known it shows a dash, never a plausible-looking figure — a panel that
 * guesses once is a panel nobody trusts again.
 *
 * WHY A GRAPH AND NOT A TABLE. Live streaming fails at the joins. "Uploads are
 * arriving but nothing passes the checker", "the worker is up but no relay is
 * recorded", "channels are being pushed to but YouTube does not call them live"
 * — each is two healthy-looking components and a broken relationship between
 * them. A table of components shows nine greens. A graph shows the red wire.
 *
 * THE MOST IMPORTANT NODE IS THE ONE THAT USED TO BE INVISIBLE. If nobody runs
 * the control process, nothing errors: broadcasts go live perfectly and then
 * never end, and the credit held back to end them is never released. It looks
 * like a YouTube problem for as long as it takes someone to think of it. So
 * `control` turns red on a stale heartbeat and says what to start.
 *
 * Polled every two seconds, and only while the tab is actually visible —
 * two-second polling of a browser tab nobody is looking at is a load problem the
 * panel would be inventing for itself.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ExternalLink, Gauge, RefreshCw, Radio, Server,
  Square, Users, Video, Zap, ShieldOff,
} from "lucide-react";
import { adminApi } from "../../api/client";
import {
  Page, PageHeader, DashCard, DataTable, Chip, ErrorBanner, EmptySlot, KpiTile,
} from "./_primitives";

/* ── palette ─────────────────────────────────────────────────────────
 * Four states, and only two of them are meant to draw the eye. Everything
 * green all the time teaches people to stop looking, so "ok" is quiet and
 * "idle" is quieter still — idle is not a fault, it is a system with nothing
 * to do, which is most of the time. */
const TONE = {
  ok:   { color: "var(--adm-success, #22C55E)", label: "ok" },
  warn: { color: "var(--adm-warning, #fbbf24)", label: "attention" },
  bad:  { color: "var(--adm-danger, #f87171)", label: "broken" },
  idle: { color: "var(--adm-text-4, #64748b)", label: "idle" },
};
const toneOf = (s) => TONE[s] || TONE.idle;

/* ── the stage ───────────────────────────────────────────────────────
 * Fixed coordinates, taken from the rig so the shape is the one that was
 * agreed. The stage scrolls horizontally rather than reflowing: a pipeline
 * drawn left to right stops meaning anything if the boxes rearrange. */
/* The DEFAULT stage. Both axes grow past this as nodes are dragged -- the
 * children are absolutely positioned, so the container never grows on its own
 * and a node dragged past the edge would simply be clipped. */
const STAGE = { w: 1286, h: 700 };
const STAGE_PAD = 48;

/* Where the arrangement is kept. Without persistence a reload throws the
 * layout away, and this panel reloads often. Versioned, so adding a node later
 * does not resurrect a stale saved layout that never knew about it. */
const POS_KEY = "kaizer.livemap.positions.v1";

function loadPositions() {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return {};
    const saved = JSON.parse(raw);
    // Only keep keys that still exist, and only numbers.
    const out = {};
    for (const k of Object.keys(LAYOUT)) {
      const p = saved[k];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        out[k] = { x: Math.max(0, p.x), y: Math.max(0, p.y) };
      }
    }
    return out;
  } catch {
    return {};          // private mode, cleared storage, corrupt JSON
  }
}

function savePositions(pos) {
  try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* not fatal */ }
}
const LAYOUT = {
  usage:   { x: 16,   y: 16,  w: 274, accent: "var(--adm-violet, #8b5cf6)", icon: Users },
  uploads: { x: 318,  y: 16,  w: 176, accent: "#6B4FD8", icon: Video },
  checker: { x: 520,  y: 16,  w: 176, accent: "#0E7C86", icon: Activity },
  redis:   { x: 722,  y: 16,  w: 192, accent: "#B33C8A", icon: Server },
  youtube: { x: 1104, y: 16,  w: 166, accent: "var(--adm-danger, #f87171)", icon: Radio },
  encode:  { x: 520,  y: 226, w: 176, accent: "#A5660B", icon: Zap },
  workers: { x: 722,  y: 226, w: 192, accent: "var(--adm-cyan, #22d3ee)", icon: Server },
  relays:  { x: 944,  y: 226, w: 176, accent: "#B33C8A", icon: Radio },
  control: { x: 722,  y: 452, w: 192, accent: "var(--adm-violet, #8b5cf6)", icon: Activity },
  credit:  { x: 318,  y: 452, w: 376, accent: "var(--adm-success, #22C55E)", icon: Gauge },
};
/* Rough heights, only for wire anchoring. The cards size themselves to their
 * content; a wire that lands a few pixels off the middle of an edge is fine,
 * a wire that lands on a card's title is not. */
const H = { usage: 300, credit: 170, default: 150 };
const heightOf = (k) => H[k] || H.default;

function anchors(key, pos, heights) {
  // Live position, not the constant: a node that has been dragged must drag
  // its wires with it.
  const n = { ...LAYOUT[key], ...(pos?.[key] || {}) };
  const h = (heights && heights[key]) || heightOf(key);
  return {
    left:   { x: n.x,            y: n.y + h / 2 },
    right:  { x: n.x + n.w,      y: n.y + h / 2 },
    top:    { x: n.x + n.w / 2,  y: n.y },
    bottom: { x: n.x + n.w / 2,  y: n.y + h },
  };
}

/* Which side of each box a wire should leave from and arrive at. Chosen per
 * pair rather than computed: an automatic router produced wires that crossed
 * the nodes they were not about, which is worse than a hand-picked curve. */
const PORTS = {
  "uploads>checker": ["right", "left"],
  "checker>encode":  ["bottom", "top"],
  "checker>redis":   ["right", "left"],
  "encode>redis":    ["right", "bottom"],
  "redis>control":   ["bottom", "top"],
  "redis>workers":   ["bottom", "top"],
  "workers>relays":  ["right", "left"],
  "relays>youtube":  ["top", "bottom"],
  "control>youtube": ["right", "right"],
  "credit>control":  ["right", "left"],
};

function wirePath(from, to, pos, heights) {
  const [fp, tp] = PORTS[`${from}>${to}`] || ["right", "left"];
  const a = anchors(from, pos, heights)[fp];
  const b = anchors(to, pos, heights)[tp];
  // A cubic curve that leaves and arrives perpendicular to the edge it touches,
  // so the direction of flow is readable where the wire meets the box.
  const horiz = fp === "left" || fp === "right";
  const horizTo = tp === "left" || tp === "right";
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  const dy = Math.max(40, Math.abs(b.y - a.y) * 0.5);
  const c1 = horiz ? { x: a.x + (fp === "right" ? dx : -dx), y: a.y } : { x: a.x, y: a.y + (fp === "bottom" ? dy : -dy) };
  const c2 = horizTo ? { x: b.x + (tp === "right" ? dx : -dx), y: b.y } : { x: b.x, y: b.y + (tp === "bottom" ? dy : -dy) };
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
}

function midpoint(from, to, pos, heights) {
  const [fp, tp] = PORTS[`${from}>${to}`] || ["right", "left"];
  const a = anchors(from, pos, heights)[fp];
  const b = anchors(to, pos, heights)[tp];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/* ── one node ────────────────────────────────────────────────────── */
function Node({ id, node, onAction, pos, drag, measure }) {
  const L = LAYOUT[id];
  const t = toneOf(node.state);
  const Icon = L.icon;
  // Where it actually is: the saved/dragged position when there is one, the
  // designed position when there is not.
  const at = { x: L.x, y: L.y, ...(pos || {}) };
  return (
    <div
      ref={measure}
      className="absolute rounded"
      style={{
        left: at.x, top: at.y, width: L.w,
        background: "var(--adm-card, #15181d)",
        border: `1px solid ${node.state === "ok" || node.state === "idle" ? "var(--adm-border, #2a2f37)" : t.color}`,
        borderTop: `3px solid ${L.accent}`,
        boxShadow: node.state === "bad" ? `0 0 0 3px color-mix(in srgb, ${t.color} 18%, transparent)` : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1.5"
           onPointerDown={(e) => drag?.onDown(id, e)}
           onPointerMove={drag?.onMove}
           onPointerUp={drag?.onUp}
           onPointerCancel={drag?.onUp}
           style={{ borderBottom: "1px solid var(--adm-divider, #23272e)",
                    cursor: drag ? "grab" : undefined, touchAction: "none" }}>
        <span className="inline-flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.12em] font-mono"
              style={{ color: L.accent }}>
          <Icon size={10} /> {node.name}
        </span>
        <span className="text-[9.5px] font-mono px-1.5 rounded-full"
              style={{ color: t.color, background: `color-mix(in srgb, ${t.color} 14%, transparent)` }}>
          {t.label}
        </span>
      </div>
      <div className="px-2 py-1.5 grid gap-0.5">
        {node.sub ? (
          <div className="text-[10px] font-mono" style={{ color: "var(--adm-text-4, #64748b)" }}>{node.sub}</div>
        ) : null}
        {(node.metrics || []).map((m) => (
          <div key={m.label} className="flex items-baseline justify-between gap-2 text-[11px]"
               style={{ color: "var(--adm-text-3, #94a3b8)" }}>
            <span className="truncate">{m.label}</span>
            <b className="font-mono tabular-nums text-[11px] font-medium"
               style={{ color: "var(--adm-text, #e5ebf1)" }}>
              {/* A dash, not a zero. "not known" and "none" are different
                  facts and a panel that conflates them misleads. */}
              {m.value === null || m.value === undefined || m.value === "" ? "—" : m.value}
              {m.unit ? <span className="opacity-60">{m.unit}</span> : null}
            </b>
          </div>
        ))}
        {node.detail ? (
          <div className="text-[10px] leading-snug mt-1 pt-1"
               style={{ color: t.color, borderTop: "1px solid var(--adm-divider, #23272e)" }}>
            {node.detail}
          </div>
        ) : null}
        {(node.items || []).length > 0 ? (
          <div className="grid gap-0.5 mt-1 pt-1" style={{ borderTop: "1px solid var(--adm-divider, #23272e)" }}>
            {node.items.slice(0, 4).map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-1.5 text-[10px] font-mono"
                   style={{ color: "var(--adm-text-4, #64748b)" }}>
                <span className="truncate" title={it.host || ""}>{it.id}</span>
                <span className="tabular-nums whitespace-nowrap">
                  {it.channels !== undefined ? `${it.channels}/${it.slots}` : null}
                  {it.current ? " busy" : null}
                  {it.relays !== undefined ? ` · ${it.relays}r` : null}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {(node.actions || []).map((a) => (
          <button key={a.kind} type="button" onClick={() => onAction(a.kind)}
                  className="mt-1 text-[10px] px-1.5 py-0.5 rounded border text-left hover:opacity-100 opacity-80"
                  style={{ borderColor: "var(--adm-border, #2a2f37)", color: "var(--adm-text-3, #94a3b8)" }}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── the usage node: the questions this tab was asked to answer ──── */
function UsageNode({ usage, pos, drag, measure }) {
  const L = LAYOUT.usage;
  const at = { x: L.x, y: L.y, ...(pos || {}) };
  const rows = [
    ["users using Live Studio now", usage.users_live_now],
    ["users in the last 24 h", usage.users_today],
    ["videos live now", usage.videos_live_now],
    ["channels live now", usage.channels_live_now],
    ["widest fan-out (1 video →)", usage.widest_fanout ? `${usage.widest_fanout} channels` : 0],
    ["broadcast starts, 24 h", usage.broadcast_starts_24h],
  ];
  return (
    <div ref={measure} className="absolute rounded" style={{
      left: at.x, top: at.y, width: L.w,
      background: "var(--adm-card, #15181d)",
      border: "1px solid var(--adm-border, #2a2f37)",
      borderTop: `3px solid ${L.accent}`,
    }}>
      <div className="flex items-center justify-between px-2 py-1.5"
           onPointerDown={(e) => drag?.onDown("usage", e)}
           onPointerMove={drag?.onMove}
           onPointerUp={drag?.onUp}
           onPointerCancel={drag?.onUp}
           style={{ borderBottom: "1px solid var(--adm-divider, #23272e)",
                    cursor: drag ? "grab" : undefined, touchAction: "none" }}>
        <span className="inline-flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.12em] font-mono"
              style={{ color: L.accent }}>
          <Users size={10} /> Who is using it
        </span>
      </div>
      <div className="px-2 py-1.5 grid gap-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-2 text-[11px]"
               style={{ color: "var(--adm-text-3, #94a3b8)" }}>
            <span className="truncate">{k}</span>
            <b className="font-mono tabular-nums" style={{ color: "var(--adm-text, #e5ebf1)" }}>
              {v === null || v === undefined ? "—" : v}
            </b>
          </div>
        ))}
        {(usage.live_users || []).length > 0 ? (
          <div className="grid gap-0.5 mt-1 pt-1" style={{ borderTop: "1px solid var(--adm-divider, #23272e)" }}>
            {/* `person`, not `u`: the enclosing scope already calls the whole
                usage object `u`, and shadowing it here made the two impossible
                to tell apart when reading. */}
            {usage.live_users.slice(0, 6).map((person) => (
              <div key={person.user_id} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="truncate" style={{ color: "var(--adm-text-2, #cbd5e1)" }}>{person.name}</span>
                <span className="font-mono tabular-nums" style={{ color: "var(--adm-text-4, #64748b)" }}>
                  {person.videos}v · {person.channels}ch
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] italic mt-1" style={{ color: "var(--adm-text-4, #64748b)" }}>
            nobody is live right now
          </div>
        )}
      </div>
    </div>
  );
}

/* ── the tab ─────────────────────────────────────────────────────── */

/* ── the live stack's own output ──────────────────────────────────────
 * Under the graph, not on its own tab: the graph says which stage is
 * unhappy and this says why, and making someone navigate between the two
 * is how a diagnosis gets abandoned halfway. */
function LiveLogs() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [level, setLevel] = useState("");
  const [proc, setProc] = useState("");
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const d = await adminApi.liveLogs(400, proc, level);
      setData(d); setErr("");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally { setBusy(false); }
  }, [proc, level]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [auto, load]);

  // Follow the tail only while the reader is already at the bottom: yanking
  // the view down while someone is reading an error above is worse than not
  // following at all.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [data]);

  const tone = (lv) =>
    lv === "error" ? "var(--adm-danger, #f87171)"
    : lv === "warn" ? "var(--adm-warn, #fbbf24)"
    : "var(--adm-text-dim, #9aa4b2)";

  const c = data?.counts || {};
  return (
    <DashCard title="Live stack log" icon={Activity} className="mb-3">
      <div className="flex items-center flex-wrap gap-2 mb-2 text-[11px]">
        {["", "error", "warn", "info"].map((lv) => (
          <button key={lv || "all"} type="button" onClick={() => setLevel(lv)}
                  className="px-2 py-0.5 rounded border"
                  style={{
                    borderColor: level === lv ? tone(lv || "info") : "var(--adm-border, #2a2f37)",
                    color: level === lv ? tone(lv || "info") : "var(--adm-text-dim, #9aa4b2)",
                  }}>
            {lv || "all"}{lv && c[lv] != null ? ` ${c[lv]}` : ""}
          </button>
        ))}
        <select value={proc} onChange={(e) => setProc(e.target.value)}
                className="px-1.5 py-0.5 rounded border bg-transparent"
                style={{ borderColor: "var(--adm-border, #2a2f37)", color: "var(--adm-text, #e6e9ef)" }}>
          <option value="">every process</option>
          {(data?.processes || []).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          follow
        </label>
        <button type="button" onClick={load} disabled={busy}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border disabled:opacity-40"
                style={{ borderColor: "var(--adm-border, #2a2f37)" }}>
          <RefreshCw size={10} className={busy ? "animate-spin" : ""} /> refresh
        </button>
      </div>

      {err && (
        <div className="text-[11px] mb-2" style={{ color: "var(--adm-danger, #f87171)" }}>
          could not read the live log: {err}
        </div>
      )}

      <div ref={boxRef}
           className="rounded font-mono text-[11px] leading-[1.45] p-2"
           style={{
             background: "var(--adm-surface, #0f1216)",
             border: "1px solid var(--adm-border, #2a2f37)",
             maxHeight: 340, overflow: "auto", resize: "vertical",
           }}>
        {(data?.lines || []).length === 0 && (
          <div style={{ color: "var(--adm-text-dim, #9aa4b2)" }}>
            {/* An empty box must not read as "nothing is wrong": a process that
                has not restarted since this shipped mirrors nothing at all. */}
            nothing yet. {data?.note || ""}
          </div>
        )}
        {(data?.lines || []).map((l) => (
          <div key={l.id} className="whitespace-pre-wrap break-words">
            <span style={{ color: "var(--adm-text-dim, #9aa4b2)" }}>
              {l.ts ? new Date(l.ts * 1000).toLocaleTimeString() : ""}{" "}
            </span>
            <span style={{ color: "var(--adm-violet, #8b5cf6)" }}>{l.proc}</span>{" "}
            <span style={{ color: tone(l.level) }}>{l.line}</span>
          </div>
        ))}
      </div>

      {(data?.relay_logs || []).length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-[0.12em] font-mono mb-1"
               style={{ color: "var(--adm-text-dim, #9aa4b2)" }}>
            relay logs on this machine
          </div>
          {data.relay_logs.map((f) => (
            <details key={f.file} className="mb-1">
              <summary className="cursor-pointer text-[11px] font-mono"
                       style={{ color: "var(--adm-cyan, #22d3ee)" }}>{f.file}</summary>
              {/* One element per line rather than a joined string: the relay
                  writes its own file and the lines are what matter, so they
                  stay individually selectable and wrap on their own. */}
              <div className="font-mono text-[10.5px] whitespace-pre-wrap break-words mt-1 p-2 rounded"
                   style={{ background: "var(--adm-surface, #0f1216)",
                            border: "1px solid var(--adm-border, #2a2f37)",
                            maxHeight: 200, overflow: "auto" }}>
                {f.lines.map((ln, i) => (
                  <div key={i}>{ln}</div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </DashCard>
  );
}

export default function AdminLiveMap() {
  const [map, setMap] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [capFor, setCapFor] = useState(null);
  const stop = useRef(false);

  /* ── a movable canvas ──────────────────────────────────────────────
   * Positions are STATE, not constants: this panel re-polls every two
   * seconds, and anything recomputed from LAYOUT on each render would
   * snap a dragged card back twice a second. Seeded from localStorage so
   * an arrangement survives a reload. */
  const [pos, setPos] = useState(() => loadPositions());
  const [heights, setHeights] = useState({});
  const dragRef = useRef(null);

  // Each card reports its real rendered height, so the stage knows how tall
  // it has to be and the wires land on real edges rather than guessed ones.
  const measure = useCallback((id) => (el) => {
    if (!el) return;
    const h = el.offsetHeight;
    setHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h }));
  }, []);

  const drag = useMemo(() => ({
    onDown: (id, e) => {
      // Only the primary button, and never when the press began on a control
      // inside the header.
      if (e.button !== 0) return;
      const base = { x: LAYOUT[id].x, y: LAYOUT[id].y, ...(pos[id] || {}) };
      dragRef.current = { id, sx: e.clientX, sy: e.clientY, ox: base.x, oy: base.y };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older engines */ }
      e.currentTarget.style.cursor = "grabbing";
      e.preventDefault();
    },
    onMove: (e) => {
      const d = dragRef.current;
      if (!d) return;
      // Clamp at the top-left only. There is deliberately no right/bottom
      // limit: the stage grows to follow.
      const x = Math.max(0, d.ox + (e.clientX - d.sx));
      const y = Math.max(0, d.oy + (e.clientY - d.sy));
      setPos((p) => ({ ...p, [d.id]: { x, y } }));
    },
    onUp: (e) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      if (e?.currentTarget) e.currentTarget.style.cursor = "grab";
      // Persist on release rather than on every move: a drag fires hundreds
      // of move events and localStorage is synchronous.
      setPos((p) => { savePositions(p); return p; });
    },
  }), [pos]);

  const resetLayout = useCallback(() => {
    setPos({});
    try { localStorage.removeItem(POS_KEY); } catch { /* not fatal */ }
  }, []);

  // The stage grows to contain whatever the nodes have been dragged to.
  const stage = useMemo(() => {
    let right = STAGE.w, bottom = STAGE.h;
    for (const k of Object.keys(LAYOUT)) {
      const at = { x: LAYOUT[k].x, y: LAYOUT[k].y, ...(pos[k] || {}) };
      right = Math.max(right, at.x + LAYOUT[k].w + STAGE_PAD);
      bottom = Math.max(bottom, at.y + (heights[k] || heightOf(k)) + STAGE_PAD);
    }
    return { w: right, h: bottom };
  }, [pos, heights]);

  const load = useCallback(async () => {
    try {
      const m = await adminApi.liveMap(40);
      setMap(m);
      setError("");
    } catch (e) {
      // 503 means the engine is off in this deployment, and the body says which
      // dependency is missing. That is a configuration answer, not a crash, so
      // it is shown as one.
      setError(e?.message || "could not read the live map");
    }
  }, []);

  useEffect(() => {
    stop.current = false;
    load();
    let t = null;
    const tick = async () => {
      if (stop.current) return;
      // Only while somebody is looking. Two-second polling of a hidden tab is
      // a load problem this panel would be inventing for itself.
      if (!document.hidden) await load();
      if (!stop.current) t = setTimeout(tick, 2000);
    };
    t = setTimeout(tick, 2000);
    return () => { stop.current = true; if (t) clearTimeout(t); };
  }, [load]);

  const act = async (label, fn) => {
    setBusy(label); setNote("");
    try {
      const out = await fn();
      setNote(typeof out === "object" ? JSON.stringify(out).slice(0, 220) : String(out || `${label} done`));
      await load();
    } catch (e) {
      setError(e?.message || `${label} failed`);
    } finally {
      setBusy("");
    }
  };

  const onAction = (kind) => {
    if (kind === "retry_encodes") return act("retry encodes", () => adminApi.liveRetryEncodes());
    if (kind === "set_user_cap") return setCapFor(capFor === null ? "" : null);
  };

  const wires = useMemo(() => (map?.wires || []).filter(
    (w) => LAYOUT[w.from] && LAYOUT[w.to]), [map]);

  if (error && !map) {
    return (
      <Page>
        <PageHeader eyebrow="Live" title="Live Map"
                    subtitle="every stage of live streaming, from real state" accent="violet" />
        <ErrorBanner error={error} onDismiss={() => setError("")} />
      </Page>
    );
  }
  if (!map) {
    return (
      <Page>
        <PageHeader eyebrow="Live" title="Live Map" accent="violet" />
        <EmptySlot text="reading the pipeline…" />
      </Page>
    );
  }

  const worst = toneOf(map.worst);
  const u = map.usage || {};
  const credit = map.credit || {};

  return (
    <Page>
      <PageHeader
        eyebrow="Live"
        title="Live Map"
        subtitle="One ffmpeg per video, fanned out to every channel by one relay. Every number here is measured, none is modelled. Drag a card by its header to rearrange; the canvas grows to follow and the layout is remembered."
        accent="violet"
        actions={
          <span className="inline-flex items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono"
                  style={{ color: worst.color, background: `color-mix(in srgb, ${worst.color} 14%, transparent)` }}>
              <Radio size={10} /> {worst.label}
            </span>
            <button type="button" onClick={load} disabled={!!busy}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border disabled:opacity-40"
                    style={{ borderColor: "var(--adm-border, #2a2f37)" }}>
              <RefreshCw size={10} className={busy ? "animate-spin" : ""} /> refresh
            </button>
            {/* The arrangement is SAVED, so there has to be a way back to the
                designed one -- otherwise a card dragged somewhere unhelpful is
                stuck there across reloads. Only offered once something has
                actually been moved. */}
            {Object.keys(pos).length > 0 && (
              <button type="button" onClick={resetLayout}
                      title="put every card back where it was designed to sit"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border"
                      style={{ borderColor: "var(--adm-border, #2a2f37)" }}>
                reset layout
              </button>
            )}
          </span>
        }
      />

      {error ? <ErrorBanner error={error} onDismiss={() => setError("")} /> : null}
      {note ? (
        <div className="text-[11px] rounded px-2 py-1.5 mb-2 font-mono"
             style={{ background: "var(--adm-bg-elev, #1a1e25)", color: "var(--adm-text-3, #94a3b8)" }}>
          {note}
        </div>
      ) : null}

      {/* ── the four numbers the founder asked for, before the graph ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <KpiTile tone="violet" icon={Users} label="Users live now" value={u.users_live_now ?? "—"}
                 sub={`${u.users_today ?? 0} in the last 24 h`} />
        <KpiTile tone="cyan" icon={Radio} label="Channels live" value={u.channels_live_now ?? "—"}
                 sub={`across ${u.videos_live_now ?? 0} video${u.videos_live_now === 1 ? "" : "s"}`} />
        <KpiTile tone="violet" icon={Video} label="Widest fan-out"
                 value={u.widest_fanout ? `1 → ${u.widest_fanout}` : "—"}
                 sub={u.widest_fanout_video ? `video ${u.widest_fanout_video}` : "one video to N channels"} />
        <KpiTile tone={credit.broadcasts_left_today === 0 ? "rose" : "cyan"} icon={Gauge}
                 label="Broadcasts left today" value={credit.broadcasts_left_today ?? "—"}
                 sub={`${credit.used ?? 0} of ${credit.limit ?? 0} units · ${credit.broadcast_cost ?? 0} each`} />
      </div>

      {/* ── the graph ── */}
      <div className="rounded mb-3" style={{
        border: "1px solid var(--adm-border, #2a2f37)",
        background: "var(--adm-surface, #0f1216)", overflow: "auto",
        // Tall enough to work in, capped so the page stays navigable; the
        // stage inside is free to be larger and scrolls within this.
        maxHeight: "78vh", resize: "vertical",
      }}>
        <div className="relative" style={{
          width: stage.w, height: stage.h,
          backgroundImage: "radial-gradient(var(--adm-divider, #23272e) 1px, transparent 1.2px)",
          backgroundSize: "20px 20px",
        }}>
          <svg width={stage.w} height={stage.h} className="absolute inset-0 pointer-events-none">
            {wires.map((w) => {
              const t = toneOf(w.state);
              const mid = midpoint(w.from, w.to, pos, heights);
              return (
                <g key={`${w.from}>${w.to}`}>
                  <path d={wirePath(w.from, w.to, pos, heights)} fill="none" stroke={t.color}
                        strokeWidth={2}
                        strokeOpacity={w.state === "ok" ? 0.4 : w.state === "idle" ? 0.22 : 0.85}
                        strokeDasharray={w.kind === "ctl" ? "3 4" : w.state === "bad" ? "6 4" : undefined} />
                  {w.label ? (
                    <text x={mid.x} y={mid.y - 5} textAnchor="middle"
                          className="font-mono" fontSize="10"
                          fill="var(--adm-text-4, #64748b)">{w.label}</text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          <UsageNode usage={u} pos={pos.usage} drag={drag} measure={measure("usage")} />
          {Object.keys(LAYOUT).filter((k) => k !== "usage" && map.nodes[k]).map((k) => (
            <Node key={k} id={k} node={map.nodes[k]} onAction={onAction}
                  pos={pos[k]} drag={drag} measure={measure(k)} />
          ))}
        </div>
      </div>

      {/* ── the live stack's own output ──
          Directly under the graph: the graph says which stage is unhappy and
          the log says why, and splitting them across tabs is how a diagnosis
          gets abandoned halfway. */}
      <LiveLogs />

      {/* ── a user's cap, opened from the credit node ── */}
      {capFor !== null ? (
        <DashCard title="Daily credit cap for one customer" icon={Gauge} className="mb-3">
          <p className="text-[11px] mb-2" style={{ color: "var(--adm-text-3, #94a3b8)" }}>
            A cap stops one customer spending the platform's whole day. Their own open
            broadcasts' closes are reserved inside it, so capping someone can never
            leave a broadcast of theirs unable to end. Blank removes the cap.
          </p>
          <form className="flex items-end gap-2 flex-wrap text-[11px]"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const uid = String(f.get("uid") || "").trim();
                  const raw = String(f.get("cap") || "").trim();
                  if (!uid) return;
                  act("set cap", () => adminApi.liveSetUserCap(uid, raw === "" ? null : Number(raw)));
                }}>
            <label className="grid gap-1">
              <span style={{ color: "var(--adm-text-4, #64748b)" }}>user id</span>
              <input name="uid" defaultValue="" required
                     className="px-2 py-1 rounded font-mono w-28"
                     style={{ background: "var(--adm-bg-elev, #1a1e25)", border: "1px solid var(--adm-border, #2a2f37)" }} />
            </label>
            <label className="grid gap-1">
              <span style={{ color: "var(--adm-text-4, #64748b)" }}>units a day (blank = none)</span>
              <input name="cap" inputMode="numeric"
                     className="px-2 py-1 rounded font-mono w-36"
                     style={{ background: "var(--adm-bg-elev, #1a1e25)", border: "1px solid var(--adm-border, #2a2f37)" }} />
            </label>
            <button type="submit" disabled={!!busy}
                    className="px-2 py-1 rounded border disabled:opacity-40"
                    style={{ borderColor: "var(--adm-border, #2a2f37)" }}>save</button>
            <button type="button" onClick={() => setCapFor(null)}
                    className="px-2 py-1 rounded border" style={{ borderColor: "var(--adm-border, #2a2f37)" }}>
              close
            </button>
          </form>
          {Object.keys(map.user_caps || {}).length > 0 ? (
            <div className="mt-2 flex gap-1.5 flex-wrap">
              {Object.entries(map.user_caps).map(([uid, cap]) => (
                <Chip key={uid} tone="violet">{(u.user_names || {})[uid] || `user ${uid}`}: {cap}</Chip>
              ))}
            </div>
          ) : null}
        </DashCard>
      ) : null}

      {/* ── one video to how many channels ── */}
      <DashCard title="One video → how many channels" icon={Video} className="mb-3">
        <DataTable headers={["Video", "Customer", "On air", "Confirmed live", "Queued", "Worker"]}
                   empty="nothing is live">
          {(u.per_video || []).map((v) => (
            <tr key={v.video_id}>
              <td className="font-mono">{v.video_id}</td>
              <td>{(u.user_names || {})[String(v.user_id)] || `user ${v.user_id}`}</td>
              <td className="font-mono tabular-nums">{v.channels_on}</td>
              <td className="font-mono tabular-nums"
                  style={{ color: v.confirmed_live < v.channels_on ? "var(--adm-warning, #fbbf24)" : undefined }}>
                {v.confirmed_live}
              </td>
              <td className="font-mono tabular-nums">{v.channels_queued || "—"}</td>
              <td className="font-mono text-[11px]">
                {v.worker}
                <button type="button" disabled={!!busy}
                        onClick={() => act(`stop ${v.video_id}`, () => adminApi.liveAdminStopVideo(v.video_id))}
                        title="Stop this video and end every one of its broadcasts"
                        className="ml-2 inline-flex items-center gap-1 px-1.5 rounded border disabled:opacity-40"
                        style={{ borderColor: "var(--adm-border, #2a2f37)" }}>
                  <Square size={9} /> stop
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      </DashCard>

      {/* ── every channel on air ── */}
      <DashCard title="Channels on air" icon={Radio} className="mb-3">
        <DataTable headers={["Channel", "Video", "State", "YouTube", "Bitrate", "Reconnects", "Units", ""]}
                   empty="no channel is on air">
          {(map.channels || []).map((c) => (
            <tr key={`${c.video_id}:${c.channel_id}`}>
              <td>{c.channel}</td>
              <td className="font-mono text-[11px]">{c.video_id}</td>
              <td>
                <span className="font-mono text-[11px]" style={{ color: toneOf(c.state).color }}>
                  {c.health || c.spec_state}
                </span>
                {c.reason ? <div className="text-[10px] opacity-70">{c.reason}</div> : null}
                {c.error ? <div className="text-[10px]" style={{ color: "var(--adm-danger, #f87171)" }}>{c.error}</div> : null}
              </td>
              <td className="font-mono text-[11px]"
                  style={{ color: c.youtube === "not_live" ? "var(--adm-danger, #f87171)"
                                 : c.youtube === "live" ? "var(--adm-success, #22C55E)" : undefined }}>
                {c.youtube || "—"}
              </td>
              <td className="font-mono tabular-nums">{c.kbps ? `${Math.round(c.kbps)} kbps` : "—"}</td>
              <td className="font-mono tabular-nums">{c.reconnects || "—"}</td>
              <td className="font-mono tabular-nums">{c.credit || "—"}</td>
              <td>
                {c.watch_url ? (
                  <a href={c.watch_url} target="_blank" rel="noreferrer"
                     className="inline-flex items-center gap-1 text-[11px] underline">
                    watch <ExternalLink size={9} />
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </DataTable>
      </DashCard>

      {/* ── blocked channels: the ones costing nothing and going nowhere ── */}
      {Object.keys(map.blocked_channels || {}).length > 0 ? (
        <DashCard title="Blocked channels" icon={ShieldOff} className="mb-3">
          <p className="text-[11px] mb-2" style={{ color: "var(--adm-text-3, #94a3b8)" }}>
            Blocked after a failure that will repeat until something changes on YouTube —
            live streaming not enabled, a revoked token. The next attempt is refused for
            free rather than spending {credit.start_cost ?? 103} units to fail the same way.
            Clear it once the customer has fixed it.
          </p>
          <DataTable headers={["Channel", "Why", ""]}>
            {Object.entries(map.blocked_channels).map(([cid, why]) => (
              <tr key={cid}>
                <td className="font-mono">{cid}</td>
                <td className="text-[11px]">{why}</td>
                <td>
                  <button type="button" disabled={!!busy}
                          onClick={() => act(`unblock ${cid}`, () => adminApi.liveAdminUnblock(cid))}
                          className="px-1.5 py-0.5 rounded border text-[11px] disabled:opacity-40"
                          style={{ borderColor: "var(--adm-border, #2a2f37)" }}>
                    clear the block
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        </DashCard>
      ) : null}

      {/* ── the event log ── */}
      <DashCard title="What happened" icon={Activity}>
        <DataTable headers={["When", "What", "Video", "Channel", "Detail"]} empty="no events yet">
          {(map.events || []).slice(0, 40).map((e, i) => (
            <tr key={e.id || i}>
              <td className="font-mono text-[11px] whitespace-nowrap">
                {e.ts ? new Date(Number(e.ts) * 1000).toLocaleTimeString() : "—"}
              </td>
              <td>
                <span className="font-mono text-[11px]"
                      style={{ color: String(e.type || "").includes("failed") ? "var(--adm-danger, #f87171)"
                                     : String(e.type || "").includes("queued") ? "var(--adm-warning, #fbbf24)"
                                     : undefined }}>
                  {e.type}
                </span>
              </td>
              <td className="font-mono text-[11px]">{e.video_id || "—"}</td>
              <td className="font-mono text-[11px]">{e.channel_id || "—"}</td>
              <td className="text-[11px] break-words">
                {[e.reason, e.error, e.credit ? `${e.credit} units` : "", e.worker]
                  .filter(Boolean).join(" · ") || "—"}
              </td>
            </tr>
          ))}
        </DataTable>
      </DashCard>

      <p className="text-[10px] mt-3 font-mono" style={{ color: "var(--adm-text-4, #64748b)" }}>
        {map.prefix} · read {map.generated_at ? new Date(map.generated_at * 1000).toLocaleTimeString() : "—"} ·
        polled every 2 s while this tab is visible · no stream key or destination URL is ever sent to this page
      </p>
    </Page>
  );
}
