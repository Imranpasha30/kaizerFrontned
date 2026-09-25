import React from "react";
import { Check } from "lucide-react";

/**
 * Kaizer X wizard kit — the branded, cohesive building blocks for the job
 * creation flow. Liquid-glass surfaces, brand orange/red accents, calm
 * premium motion (150-260ms), fully keyboard + screen-reader accessible.
 * Every option-selection screen composes these so the brand feels like one
 * designed product, not a form.
 */

/* Glass surface for a step's body. */
export function GlassCard({ className = "", children, ...rest }) {
  return (
    <div
      className={`relative rounded-3xl border border-white/10 bg-white/[0.045] backdrop-blur-2xl
        shadow-[0_24px_80px_-32px_rgba(0,0,0,0.85)] ${className}`}
      {...rest}
    >
      {/* top sheen */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      {children}
    </div>
  );
}

/* Step title block: small eyebrow, big title, calm helper line. */
export function StepHeading({ eyebrow, title, hint, icon: Icon }) {
  return (
    <div className="mb-5">
      {eyebrow && (
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] font-semibold text-accent2/90">
          {Icon && <Icon size={13} className="text-accent2" />}
          {eyebrow}
        </div>
      )}
      {title && <h2 className="mt-1.5 text-xl sm:text-2xl font-bold text-white tracking-tight">{title}</h2>}
      {hint && <p className="mt-1.5 text-sm text-gray-400 leading-relaxed max-w-xl">{hint}</p>}
    </div>
  );
}

/* Responsive auto-fit grid of choices. */
export function ChoiceGrid({ min = 190, className = "", children }) {
  return (
    <div
      className={`grid gap-3 ${className}`}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}
    >
      {children}
    </div>
  );
}

/* Little status pill — "Recommended", cost, "New", etc. */
export function Badge({ tone = "accent", children, className = "" }) {
  const tones = {
    accent: "bg-accent/15 text-accent2 border-accent/30",
    emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
    slate: "bg-white/8 text-gray-300 border-white/15",
    violet: "bg-violet-500/15 text-violet-300 border-violet-400/30",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold
      border ${tones[tone] || tones.slate} ${className}`}>
      {children}
    </span>
  );
}

/**
 * The workhorse selectable card. Icon + title + description + optional badge.
 * Branded selected state (accent ring + glow + check), gentle hover lift.
 */
export function ChoiceCard({
  selected = false, onClick, disabled = false,
  icon: Icon, iconNode, title, desc, badge, className = "", children,
}) {
  const handleKey = (e) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick && onClick(e); }
  };
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={selected}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onKeyDown={handleKey}
      className={`group relative text-left rounded-2xl border p-4 transition-all duration-200 outline-none
        ${disabled ? "opacity-45 cursor-not-allowed" : "cursor-pointer hover:-translate-y-0.5"}
        ${selected
          ? "border-accent/70 bg-accent/10 shadow-[0_0_0_1px_rgba(224,49,43,0.4),0_18px_50px_-20px_rgba(224,49,43,0.6)]"
          : "border-white/10 bg-white/[0.035] hover:border-white/25 hover:bg-white/[0.06]"}
        focus-visible:ring-2 focus-visible:ring-accent/60 ${className}`}
    >
      {selected && (
        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-gradient-to-br from-accent to-accent2
          flex items-center justify-center shadow-lg shadow-accent/40">
          <Check size={12} className="text-white" strokeWidth={3} />
        </div>
      )}
      {(Icon || iconNode) && (
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors
          ${selected ? "bg-accent/20 text-accent2" : "bg-white/8 text-gray-300 group-hover:text-white"}`}>
          {iconNode || (Icon && <Icon size={19} />)}
        </div>
      )}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {title && <div className="text-sm font-semibold text-white leading-snug pr-6">{title}</div>}
          {desc && <div className="mt-1 text-[12px] text-gray-400 leading-relaxed">{desc}</div>}
        </div>
      </div>
      {badge && <div className="mt-2.5">{badge}</div>}
      {children}
    </div>
  );
}

/* Segmented pill control for 2-4 mutually-exclusive small choices. */
export function Segmented({ value, onChange, options, className = "" }) {
  return (
    <div className={`inline-flex p-1 rounded-xl border border-white/10 bg-white/[0.04] ${className}`}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200
              ${active ? "bg-gradient-to-br from-accent to-accent2 text-white shadow shadow-accent/30"
                : "text-gray-400 hover:text-white"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* Premium on/off switch with a label + optional helper. */
export function Toggle({ checked, onChange, label, hint, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`flex items-start gap-3 w-full text-left rounded-2xl border p-3.5 transition-all duration-200
        outline-none focus-visible:ring-2 focus-visible:ring-accent/60
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-white/25"}
        ${checked ? "border-accent/50 bg-accent/8" : "border-white/10 bg-white/[0.035]"}`}
    >
      <span className={`mt-0.5 relative w-10 h-6 rounded-full flex-shrink-0 transition-colors duration-200
        ${checked ? "bg-gradient-to-r from-accent to-accent2" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
          ${checked ? "translate-x-4" : ""}`} />
      </span>
      <span className="min-w-0">
        {label && <span className="block text-sm font-semibold text-white">{label}</span>}
        {hint && <span className="block mt-0.5 text-[12px] text-gray-400 leading-relaxed">{hint}</span>}
      </span>
    </button>
  );
}

/* Labeled field wrapper for inputs/selects with helper text. */
export function Field({ label, hint, htmlFor, children, className = "" }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-semibold text-gray-300 mb-1.5">{label}</label>
      )}
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-gray-500 leading-relaxed">{hint}</p>}
    </div>
  );
}
