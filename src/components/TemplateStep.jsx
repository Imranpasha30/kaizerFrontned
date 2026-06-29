import CustomTemplatePicker from "./CustomTemplatePicker";

/**
 * TemplateStep — the New Job wizard's "Choose Template" step, FILTERED by the output
 * kind chosen in the previous step:
 *   - "short": built-in 9:16 frames + short custom templates       -> sets `frame`
 *   - "full":  built-in newsroom (default) + full custom templates -> sets `fullformLayout`
 *   - "both":  both sections; user must pick a short template AND a full-form choice,
 *              then clicks Continue (no auto-advance).
 *
 * A template's kind is decided by its canvas aspect on the server, so a Short job never
 * even sees full-form templates (and vice-versa) — that's the crash-guard at the UI layer.
 */
function isCustomWithMedia(key, tpl) {
  if (!String(key).startsWith("custom:")) return false;
  const slots = (tpl && Array.isArray(tpl.slots)) ? tpl.slots : [];
  return slots.some((s) => ["video", "background", "intro", "image"].includes(s.kind));
}

export default function TemplateStep({
  templateKind, isV4, frames, FrameLayoutMock,
  frame, setFrame,
  fullformLayout, setFullformLayout, fullChosen, setFullChosen,
  customTpl, setCustomTpl, setTemplateMedia, setMainMediaSlot, setMediaReady,
  templateOk, setStep,
}) {
  const both = templateKind === "both";
  const advance = () => { if (!both) setStep(2); };

  // Reset the per-slot media collected for a previously-chosen custom template.
  const resetMedia = () => { setTemplateMedia({}); setMainMediaSlot(""); setMediaReady(false); };

  const chooseShort = (key, tpl) => {
    setFrame(key);
    if (isCustomWithMedia(key, tpl)) { setCustomTpl(tpl); resetMedia(); }
    else { setCustomTpl(null); }      // built-in frame -> no per-slot media step
    advance();
  };

  const chooseFull = (key, tpl) => {
    setFullformLayout(key);           // "" = built-in bulletin, "custom:<id>" = custom full
    setFullChosen(true);
    // In "both" mode the short template drives the per-slot media picker; only let a
    // custom full template claim it when there's no custom short selected.
    const frameIsCustom = String(frame).startsWith("custom:");
    if (isCustomWithMedia(key, tpl) && !frameIsCustom) { setCustomTpl(tpl); resetMedia(); }
    advance();
  };

  const heading = templateKind === "full" ? "Choose a Full-form Template"
    : both ? "Choose your templates" : "Choose a Shorts Template";
  const sub = templateKind === "full"
    ? "Your 16:9 full-form video. Use the built-in newsroom layout, or one of your uploaded full-form templates."
    : both
    ? "You're making BOTH outputs — pick a 9:16 short template AND a 16:9 full-form choice."
    : "Every template renders one 9:16 video per story. Same trim, same audio — different on-screen look.";

  // ---- Built-in 9:16 frame card (short side) ----
  const FrameCard = ({ frameKey, label }) => {
    const description = label.split("—")[1]?.trim() || "";
    const isSelected = frame === frameKey;
    return (
      <button
        type="button"
        onClick={() => chooseShort(frameKey)}
        className={`group relative rounded-xl overflow-hidden border-2 transition-all text-left
          ${isSelected
            ? "border-accent ring-2 ring-accent/40 shadow-lg shadow-accent/20"
            : "border-border hover:border-accent/60 hover:shadow-md hover:-translate-y-0.5"}`}
      >
        <div className="bg-black p-3 pb-2">
          {FrameLayoutMock ? <FrameLayoutMock layoutKey={frameKey} /> : null}
        </div>
        <div className="bg-panel px-3 py-2.5 border-t border-border">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-white text-sm capitalize truncate">
              {frameKey.replace("_", " ")}
            </div>
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full
                             bg-accent2/15 text-accent2 border border-accent2/40 flex-shrink-0">
              Shorts
            </span>
          </div>
          {description && (
            <div className="text-[11px] text-gray-500 mt-1 line-clamp-2 leading-tight">{description}</div>
          )}
        </div>
        {isSelected && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-accent text-white
                          flex items-center justify-center text-xs font-bold shadow-md">✓</div>
        )}
      </button>
    );
  };

  const showShort = templateKind === "short" || both;
  const showFull = templateKind === "full" || both;

  return (
    <div>
      <div className="mb-5">
        <h2 className="font-semibold text-white text-lg">{heading}</h2>
        <p className="text-xs text-gray-500 mt-1">{sub}</p>
      </div>

      {/* ---- SHORT side ---- */}
      {showShort && (
        <div className={both ? "mb-8 pb-6 border-b border-gray-800" : ""}>
          {both && (
            <div className="text-[11px] uppercase tracking-wide text-pink-300 font-bold mb-3">
              1 · Short template (9:16)
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Object.entries(frames).map(([key, label]) => (
              <FrameCard key={key} frameKey={key} label={label} />
            ))}
          </div>
          {/* Developer-uploaded short templates — only on the V4 pipeline. */}
          {isV4 && (
            <CustomTemplatePicker kind="short" selectedKey={frame} onSelect={chooseShort} />
          )}
        </div>
      )}

      {/* ---- FULL side ---- */}
      {showFull && (
        <div>
          {both && (
            <div className="text-[11px] uppercase tracking-wide text-indigo-300 font-bold mb-3">
              2 · Full-form template (16:9)
            </div>
          )}
          {/* Built-in newsroom (default) card */}
          <button
            type="button"
            onClick={() => { setFullformLayout(""); setFullChosen(true); advance(); }}
            className={`w-full sm:w-80 text-left rounded-xl border-2 p-4 transition
              ${fullChosen && !fullformLayout
                ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-accent/60"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-white text-sm">Built-in newsroom (default)</div>
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full
                               bg-indigo-500/15 text-indigo-300 border border-indigo-500/40 flex-shrink-0">
                Full form
              </span>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              The standard multi-story 16:9 bulletin. No upload needed.
            </div>
            {fullChosen && !fullformLayout && (
              <div className="text-[11px] text-accent2 mt-1.5 font-medium">✓ Selected</div>
            )}
          </button>
          {/* Developer-uploaded full-form templates. */}
          <CustomTemplatePicker kind="full" selectedKey={fullformLayout} onSelect={chooseFull} />
        </div>
      )}

      {/* "both" needs an explicit Continue — two independent choices, no auto-advance. */}
      {both && (
        <div className="mt-6 flex items-center justify-end gap-3">
          {!templateOk && (
            <span className="text-xs text-gray-500">
              Pick a short template and a full-form choice to continue.
            </span>
          )}
          <button
            type="button"
            disabled={!templateOk}
            onClick={() => setStep(2)}
            className="px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white
                       font-semibold text-sm disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
