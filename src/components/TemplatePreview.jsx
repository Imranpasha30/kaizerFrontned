import { useState } from "react";
import { api } from "../api/client";

/**
 * TemplatePreview — a professional "expanded" view of a custom template.
 * Opened from the small card in CustomTemplatePicker. Shows the large preview +
 * metadata: created-on, canvas/ratio, slot breakdown, "When to use", "How to use".
 *
 * Props: template (dict from /api/templates), onClose, onUse(template)
 */
function ratioLabel(w, h) {
  if (!w || !h) return "";
  const g = (a, b) => (b ? g(b, a % b) : a);
  const d = g(w, h) || 1;
  return `${w}×${h} (${w / d}:${h / d})`;
}
function fmtDate(s) {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return String(s).slice(0, 10); }
}

export default function TemplatePreview({ template: t, onClose, onUse }) {
  const [rating, setRating] = useState(t ? t.rating : null);
  const [count, setCount] = useState(t ? (t.rating_count || 0) : 0);
  const [myStars, setMyStars] = useState(0);
  const [hover, setHover] = useState(0);
  if (!t) return null;
  const cv = Array.isArray(t.canvas) ? t.canvas : [1080, 1920];
  const slots = Array.isArray(t.slots) ? t.slots : [];
  const videoCount = t.video_slots ?? slots.filter((s) => s.kind === "video" || s.kind === "background").length;
  const Stat = ({ label, value }) => (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm text-white font-medium">{value}</div>
    </div>
  );
  async function rate(n) {
    setMyStars(n);
    try {
      const r = await api.rateTemplate(t.id, n);
      setRating(r.rating); setCount(r.rating_count || 0);
    } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#151922] border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[90vh]
                      overflow-hidden flex flex-col md:flex-row" onClick={(e) => e.stopPropagation()}>
        {/* Large preview */}
        <div className="md:w-1/2 bg-black flex items-center justify-center p-4">
          {t.preview_url
            ? <img src={t.preview_url} alt={t.name}
                   className="max-h-[60vh] md:max-h-[82vh] w-auto rounded-lg object-contain" />
            : <div className="text-gray-600 text-sm py-20">no preview</div>}
        </div>

        {/* Details */}
        <div className="md:w-1/2 p-6 overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-white font-bold text-xl">{t.name || "Untitled template"}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold
                  ${t.visibility === "public" ? "bg-emerald-600/90 text-white" : "bg-gray-800 text-gray-300"}`}>
                  {t.visibility === "public" ? "Public" : "Private"}
                </span>
                {t.mine && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600/80 text-white">Yours</span>}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent2/15 text-accent2 border border-accent2/40">
                  {cv[0] > cv[1] ? "Full form" : "Shorts"}
                </span>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none px-1">✕</button>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-5">
            <Stat label="Canvas" value={ratioLabel(cv[0], cv[1])} />
            <Stat label="Slots" value={`${videoCount} video${videoCount !== 1 ? "s" : ""}${t.image_slots ? ` · ${t.image_slots} img` : ""}${t.text_slots ? ` · ${t.text_slots} text` : ""}`} />
            {t.created_at && <Stat label="Created" value={fmtDate(t.created_at)} />}
            <Stat label="Used" value={`${t.use_count || 0} time${(t.use_count || 0) !== 1 ? "s" : ""}`} />
          </div>

          {/* Community rating */}
          <div className="mt-5">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
              Rating {rating != null ? <span className="text-white">{rating} ({count})</span>
                                     : <span className="text-gray-500">not rated yet</span>}
            </div>
            <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" title={`Rate ${n}`}
                  onMouseEnter={() => setHover(n)} onClick={() => rate(n)}
                  className={`text-xl leading-none ${(hover || myStars || Math.round(rating || 0)) >= n
                    ? "text-amber-400" : "text-gray-600"} hover:scale-110 transition`}>
                  ★
                </button>
              ))}
              {myStars > 0 && <span className="text-xs text-gray-400 ml-2">you rated {myStars}</span>}
            </div>
          </div>

          {/* Slot fill plan — what the offline filler will write into each slot at render.
              Answers "will my placeholder be replaced?" before the user ever runs a job. */}
          {Array.isArray(t.slot_audit) && t.slot_audit.length > 0 && (
            <div className="mt-6">
              <h3 className="text-[12px] uppercase tracking-wide text-sky-400 font-semibold mb-1.5">
                How each slot fills
              </h3>
              <div className="space-y-1">
                {t.slot_audit.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px]">
                    <span className="font-mono text-gray-300 shrink-0">{a.key}</span>
                    <span className="text-gray-600">←</span>
                    <span className="text-gray-400">{a.fill_source}</span>
                    {a.is_placeholder && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        placeholder auto-replaced
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[10.5px] text-gray-600 mt-1.5">
                Any slot with no content is hidden in the final video — author placeholder text never shows.
              </p>
            </div>
          )}

          {(t.when_to_use || t.how_to_use || t.description) && (
            <div className="mt-6 space-y-4">
              {t.when_to_use && (
                <section>
                  <h3 className="text-[12px] uppercase tracking-wide text-orange-400 font-semibold mb-1">When to use</h3>
                  <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{t.when_to_use}</p>
                </section>
              )}
              {(t.how_to_use || t.description) && (
                <section>
                  <h3 className="text-[12px] uppercase tracking-wide text-teal-400 font-semibold mb-1">How to use</h3>
                  <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{t.how_to_use || t.description}</p>
                </section>
              )}
            </div>
          )}

          {onUse && (
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => onUse(t)}
                className="px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm">
                Use this template
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
