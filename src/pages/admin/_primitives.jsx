/* Admin design-system primitives.
   One file owns every "look-and-feel" element used by the 11 admin tabs.
   Mutate styling here once → every tab inherits.

   Backed by ./../theme/admin-theme.css (palette tokens + utility classes).
   ----------------------------------------------------------------- */
import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

/* ── KPI tile (left-rail "20 350 NB Conversions" style) ─────────────── */
export function KpiTile({ tone = "cyan", label, value, delta, sub, icon: Icon }) {
  return (
    <div className={`adm-kpi adm-kpi--${tone === "cyan" ? "" : tone}`.trim()}>
      <div className="adm-kpi__label flex items-center gap-1.5">
        {Icon && <Icon size={11} />} {label}
      </div>
      <div className="adm-kpi__value">{value ?? <span style={{ opacity: 0.5 }}>—</span>}</div>
      {(delta != null || sub) && (
        <div className="adm-kpi__delta">
          {delta != null && (
            <>
              {delta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              <span>{Math.abs(delta).toFixed(0)}%</span>
            </>
          )}
          {sub && <span style={{ opacity: 0.85 }}>· {sub}</span>}
        </div>
      )}
    </div>
  );
}

/* ── Dashboard card (replaces ad-hoc <Card> in admin pages) ─────────── */
export function DashCard({ glass = false, className = "", title, icon: Icon, action, footer, children, ...rest }) {
  return (
    <div className={`${glass ? "adm-card-glass" : "adm-card"} p-4 ${className}`} {...rest}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && (
            <div className="adm-section-title">
              {Icon && <Icon size={13} />} {title}
            </div>
          )}
          {action}
        </div>
      )}
      {children}
      {footer && <div className="mt-3 pt-3 border-t border-[var(--adm-divider)] text-[11px] text-[var(--adm-text-4)]">{footer}</div>}
    </div>
  );
}

/* ── Range tab group (Day / Week / Month / 24h …) ───────────────────── */
export function RangeTabs({ value, onChange, options }) {
  return (
    <div className="adm-range" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`adm-range__btn ${value === o.value ? "is-active" : ""}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Chip / status pill ─────────────────────────────────────────────── */
export function Chip({ tone = "default", children, className = "", ...rest }) {
  const cls = tone === "default" ? "adm-chip" : `adm-chip adm-chip--${tone}`;
  return <span className={`${cls} ${className}`} {...rest}>{children}</span>;
}

/* ── Page header ────────────────────────────────────────────────────── */
export function PageHeader({ eyebrow, title, subtitle, accent = "violet", actions }) {
  const accentClass = accent === "cyan" ? "text-[var(--adm-cyan)]" : "text-[var(--adm-violet-2)]";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
      <div className="min-w-0">
        {eyebrow && <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--adm-text-4)] mb-1">{eyebrow}</div>}
        <h2 className="text-2xl font-semibold text-[var(--adm-text)] tracking-tight">
          {/* Render an accent token visually if title contains the slash */}
          {String(title || "").split("/").map((part, i, arr) => (
            <React.Fragment key={i}>
              {part}
              {i < arr.length - 1 && <span className={`mx-2 ${accentClass}`}>/</span>}
            </React.Fragment>
          ))}
        </h2>
        {subtitle && (
          <div className="text-xs text-[var(--adm-text-4)] mt-0.5">{subtitle}</div>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

/* ── Section title (above any chart / table) ────────────────────────── */
export function SectionTitle({ icon: Icon, children, action }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="adm-section-title">
        {Icon && <Icon size={12} />} {children}
      </div>
      {action}
    </div>
  );
}

/* ── Data table (replaces ad-hoc admin tables) ──────────────────────── */
export function DataTable({ headers = [], children, empty = "No rows" }) {
  return (
    <div className="adm-card overflow-hidden" style={{ padding: 0 }}>
      <div className="overflow-x-auto">
        <table className="adm-table">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} className={h.className || ""} style={{ textAlign: h.align || "left" }}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {React.Children.count(children) === 0 ? (
              <tr>
                <td colSpan={headers.length} className="text-center py-8" style={{ color: "var(--adm-text-5)" }}>
                  {empty}
                </td>
              </tr>
            ) : children}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Empty / loading slot ───────────────────────────────────────────── */
export function EmptySlot({ text = "No data" }) {
  return (
    <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: "var(--adm-text-5)" }}>
      {text}
    </div>
  );
}

/* ── Inline error banner (used on every admin tab) ──────────────────── */
export function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-md text-xs"
         style={{ background: "rgba(239,68,68,0.06)",
                  border: "1px solid rgba(239,68,68,0.35)",
                  color: "#fca5a5" }}>
      <div className="flex-1 break-words">{error}</div>
      {onDismiss && (
        <button onClick={onDismiss} className="hover:text-white" type="button">✕</button>
      )}
    </div>
  );
}

/* ── Live status dot (used in header) ───────────────────────────────── */
export function LiveDot({ state = "live", label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--adm-text-3)" }}>
      <span className={`adm-dot adm-dot--${state}`} /> {label}
    </span>
  );
}

/* ── Shared chart palette (Recharts-ready) ──────────────────────────── */
export const CHART = {
  series: ["#7c3aed", "#06b6d4", "#a78bfa", "#22c55e", "#f59e0b", "#ec4899"],
  grid:   "rgba(148, 163, 184, 0.08)",
  axis:   "#64748b",
  text:   "#94a3b8",
  tooltipBg: "#0f172a",
  tooltipBorder: "rgba(148,163,184,0.18)",
  // Distinguishable line styles for color-blind a11y
  dashArray: [undefined, "6 4", "2 4", undefined, "8 4", "1 3"],
};

/* ── Tooltip body (Recharts) ────────────────────────────────────────── */
export function ChartTooltip({ active, payload, label, labelFormatter = (l) => l, formatter = (v) => v }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: CHART.tooltipBg,
        border: `1px solid ${CHART.tooltipBorder}`,
        boxShadow: "0 10px 24px rgba(0,0,0,0.45)",
        borderRadius: 10,
        padding: "8px 12px",
        fontSize: 12,
      }}
    >
      <div style={{ color: "var(--adm-text-3)", marginBottom: 4 }}>{labelFormatter(label)}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 tabular-nums" style={{ color: "var(--adm-text)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 8, background: p.color || p.fill }} />
          <span style={{ color: "var(--adm-text-3)" }}>{p.name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600 }}>{formatter(p.value, p)}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Filter button (icon + active state) ────────────────────────────── */
export function FilterButton({ icon: Icon, children, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] px-2.5 py-1 rounded border transition-colors flex items-center gap-1.5"
      style={
        active
          ? { borderColor: "var(--adm-violet)", background: "rgba(124,58,237,0.12)", color: "var(--adm-violet-2)" }
          : { borderColor: "var(--adm-border)", color: "var(--adm-text-3)", background: "transparent" }
      }
    >
      {Icon && <Icon size={11} />}
      {children}
    </button>
  );
}

/* ── Page wrapper with consistent spacing ───────────────────────────── */
export function Page({ children }) {
  return <div className="space-y-5 max-w-[1480px]">{children}</div>;
}
