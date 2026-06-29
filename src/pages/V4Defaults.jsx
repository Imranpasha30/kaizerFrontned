import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, Save, CheckCircle2 } from "lucide-react";
import { api } from "../api/client";

const FRAME_LAYOUTS = [
  { value: "torn_card",   label: "Torn Card",   desc: "Top video · red headline strip · bottom image" },
  { value: "clean_card",  label: "Clean Card",  desc: "Top half video · red band with framed image" },
  { value: "split_frame", label: "Split Frame", desc: "Thumbnail top · video bottom (dark backdrop)" },
  { value: "follow_bar",  label: "Follow Bar",  desc: "Yellow headline · square video · follow strip" },
];

const FONTS = [
  "NotoSansTelugu-Bold.ttf", "Ponnala-Regular.ttf", "NotoSerifTelugu-Bold.ttf",
  "HindGuntur-Bold.ttf", "Gurajada-Regular.ttf", "Ramabhadra-Regular.ttf",
  "TenaliRamakrishna-Regular.ttf", "Timmana-Regular.ttf",
  "NotoSansDevanagari-Bold.ttf", "NotoSansTamil-Bold.ttf",
  "NotoSansKannada-Bold.ttf", "NotoSansBengali-Bold.ttf",
];

const LANGUAGES = [
  { code: "te", native: "తెలుగు",  english: "Telugu" },
  { code: "hi", native: "हिन्दी",    english: "Hindi" },
  { code: "ta", native: "தமிழ்",   english: "Tamil" },
  { code: "kn", native: "ಕನ್ನಡ",   english: "Kannada" },
  { code: "ml", native: "മലയാളം", english: "Malayalam" },
  { code: "bn", native: "বাংলা",   english: "Bengali" },
  { code: "mr", native: "मराठी",    english: "Marathi" },
  { code: "gu", native: "ગુજરાતી", english: "Gujarati" },
  { code: "en", native: "English", english: "English" },
];

export default function V4Defaults() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [d, setD]             = useState({
    platform: "full_video_shorts_v4",
    frame_layout: "torn_card",
    language: "te",
    font_file: "NotoSansTelugu-Bold.ttf",
    text_color: "#FFFFFF",
    channel_ids: [],
    privacy: "public",
    auto_publish: false,
    require_consent: true,
    brand_suffix: "",
    watermark_text: "",
    watermark_opacity: 0.35,
    watermark_position: "top-right",
  });
  const [channels, setChannels] = useState([]);

  useEffect(() => {
    Promise.all([api.v4GetDefaults(), api.listChannels().catch(() => [])])
      .then(([defaults, chans]) => {
        setD((prev) => ({ ...prev, ...(defaults || {}) }));
        setChannels(Array.isArray(chans) ? chans : []);
      })
      .finally(() => setLoading(false));
  }, []);

  function update(patch) {
    setD((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }

  function toggleChannel(id) {
    setD((prev) => {
      const set = new Set(prev.channel_ids || []);
      if (set.has(id)) set.delete(id); else set.add(id);
      return { ...prev, channel_ids: [...set] };
    });
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      await api.v4PutDefaults(d);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-1">
        <Link to="/app" className="text-gray-500 hover:text-white text-sm flex items-center gap-1">
          <ArrowLeft size={14} /> Back
        </Link>
      </div>
      <h1 className="text-xl font-bold text-white mb-1">V4 Auto-Pipeline Defaults</h1>
      <p className="text-xs text-gray-500 mb-6">
        Set these once. Then every new job goes from <span className="text-accent2">raw video</span> to
        {" "}<span className="text-accent2">published on YouTube</span> with no clicks in between —
        unless you want to tweak something, in which case the editor stays available as a manual override.
      </p>

      <Section title="Output style">
        <Field label="Frame layout (shorts)">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {FRAME_LAYOUTS.map((f) => (
              <button
                key={f.value}
                onClick={() => update({ frame_layout: f.value })}
                className={`p-2 rounded border text-left text-xs transition-all
                  ${d.frame_layout === f.value
                    ? "border-accent bg-accent/10 text-white"
                    : "border-border text-gray-300 hover:border-gray-500"}`}
              >
                <div className="font-medium">{f.label}</div>
                <div className="text-[10px] text-gray-500 leading-tight mt-0.5">{f.desc}</div>
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Language">
            <select
              value={d.language}
              onChange={(e) => update({ language: e.target.value })}
              className="w-full bg-black/60 border border-border rounded px-2 py-1.5 text-sm text-gray-200"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.native} ({l.english})</option>
              ))}
            </select>
          </Field>

          <Field label="Font">
            <select
              value={d.font_file}
              onChange={(e) => update({ font_file: e.target.value })}
              className="w-full bg-black/60 border border-border rounded px-2 py-1.5 text-sm text-gray-200"
            >
              {FONTS.map((f) => (<option key={f} value={f}>{f}</option>))}
            </select>
          </Field>

          <Field label="Headline colour">
            <input
              type="color"
              value={d.text_color}
              onChange={(e) => update({ text_color: e.target.value })}
              className="w-full h-9 bg-black/60 border border-border rounded"
            />
          </Field>
        </div>
      </Section>

      <Section title="Publishing">
        <Field label="Channels to fan out to">
          {channels.length === 0 ? (
            <div className="text-xs text-gray-500 italic">
              No connected channels yet. <Link to="/channels" className="text-accent2">Connect one →</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto">
              {channels.map((c) => {
                const checked = (d.channel_ids || []).includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer text-xs
                      ${checked ? "border-accent bg-accent/10" : "border-border hover:border-gray-500"}`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleChannel(c.id)} />
                    <span className="flex-1 truncate text-gray-200">{c.name || `Channel #${c.id}`}</span>
                    {c.google_channel_title && (
                      <span className="text-[10px] text-gray-500 truncate max-w-[120px]">
                        {c.google_channel_title}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Privacy">
            <div className="flex gap-3 text-xs text-gray-300">
              {["public", "unlisted", "private"].map((v) => (
                <label key={v} className="flex items-center gap-1 capitalize cursor-pointer">
                  <input
                    type="radio" name="privacy" value={v}
                    checked={d.privacy === v}
                    onChange={() => update({ privacy: v })}
                  />
                  {v}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Brand suffix (appended to titles)">
            <input
              type="text"
              value={d.brand_suffix}
              onChange={(e) => update({ brand_suffix: e.target.value })}
              placeholder=" | KAIZER X"
              className="w-full bg-black/60 border border-border rounded px-2 py-1.5 text-sm text-gray-200"
            />
          </Field>
        </div>
      </Section>

      <Section title="Watermark (every video stamps this in the corner)">
        <Field label="Watermark text (leave blank for logo-only)">
          <input
            type="text"
            value={d.watermark_text}
            onChange={(e) => update({ watermark_text: e.target.value })}
            placeholder="e.g. KAIZER X"
            maxLength={30}
            className="w-full bg-black/60 border border-border rounded px-2 py-1.5 text-sm text-gray-200"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Opacity (${Math.round(d.watermark_opacity * 100)}%)`}>
            <input
              type="range"
              min={0.05} max={1} step={0.05}
              value={d.watermark_opacity}
              onChange={(e) => update({ watermark_opacity: parseFloat(e.target.value) })}
              className="w-full"
            />
          </Field>
          <Field label="Position">
            <select
              value={d.watermark_position}
              onChange={(e) => update({ watermark_position: e.target.value })}
              className="w-full bg-black/60 border border-border rounded px-2 py-1.5 text-sm text-gray-200"
            >
              <option value="top-left">Top-left</option>
              <option value="top-right">Top-right</option>
              <option value="bottom-left">Bottom-left</option>
              <option value="bottom-right">Bottom-right</option>
            </select>
          </Field>
        </div>
        <p className="text-[11px] text-gray-500 leading-snug">
          Painted on every rendered output — full video AND every short. The logo comes from
          your channel's "VIDEO OVERLAY LOGO" upload; text + opacity + corner are picked here.
        </p>
      </Section>

      <Section title="Automation">
        <label className="flex items-start gap-3 p-3 rounded border border-border cursor-pointer hover:border-gray-500">
          <input
            type="checkbox"
            checked={d.auto_publish}
            onChange={(e) => update({ auto_publish: e.target.checked })}
            className="mt-1"
          />
          <div>
            <div className="font-medium text-sm text-white">Auto-publish after render</div>
            <div className="text-[11px] text-gray-500 leading-tight">
              When the V4 pipeline finishes, queue uploads to every channel above without me touching anything.
            </div>
          </div>
        </label>

        <label className={`flex items-start gap-3 p-3 rounded border cursor-pointer
          ${d.auto_publish ? "border-amber-500/50 bg-amber-500/5" : "border-border opacity-60"}`}>
          <input
            type="checkbox"
            checked={d.require_consent}
            onChange={(e) => update({ require_consent: e.target.checked })}
            disabled={!d.auto_publish}
            className="mt-1"
          />
          <div>
            <div className="font-medium text-sm text-white">
              Ask me before each upload
              <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40">
                Recommended
              </span>
            </div>
            <div className="text-[11px] text-gray-500 leading-tight">
              Show a "Ready to publish to N channels" banner in the editor when the render finishes.
              Uncheck only if you really want fully unattended publishing.
            </div>
          </div>
        </label>
      </Section>

      <div className="sticky bottom-0 bg-bg/90 backdrop-blur py-3 mt-6 flex items-center gap-3 border-t border-border">
        <button
          onClick={save}
          disabled={saving}
          className="btn btn-primary inline-flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? (<><Loader2 size={14} className="animate-spin" /> saving…</>) :
                    (<><Save size={14} /> Save defaults</>)}
        </button>
        {saved && (
          <span className="text-green-400 text-sm flex items-center gap-1">
            <CheckCircle2 size={14} /> Saved — new jobs will use these settings.
          </span>
        )}
        <Link to="/new" className="ml-auto text-sm text-accent2 hover:text-white">
          Create a job using these →
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="card p-4 mb-4">
      <h3 className="text-sm font-semibold text-white mb-3 uppercase tracking-wider">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[11px] text-gray-500 mb-1">{label}</div>
      {children}
    </div>
  );
}
