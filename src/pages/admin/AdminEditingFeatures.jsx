import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Play, Search, Volume2 } from "lucide-react";
import { api, getToken } from "../../api/client";

// The editing-engine catalog: every style pack, transition, grade, frame
// effect, overlay/HUD, text animation, sound and layout the renderer can
// use — each with an on-demand rendered DUMMY so the admin can see/hear
// exactly what it is. Previews render once on the backend and are cached.

function withAuth(url) {
  if (!url) return url;
  const t = getToken();
  if (!t) return url;
  return url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(t);
}

// preview media kind per section preview_kind
const MEDIA = { transition: "video", sound: "audio" }; // default: image

function PreviewBox({ kind, itemId }) {
  const [state, setState] = useState({ status: "idle", url: null, media: null });

  const load = async () => {
    setState({ status: "loading", url: null, media: null });
    try {
      const r = await api.adminEditingFeaturePreview(kind, itemId);
      setState({ status: "ready", url: withAuth(r.url), media: r.media || null });
    } catch (e) {
      setState({ status: "error", url: null, media: null });
    }
  };

  // backend says what it rendered (real-clip MP4 vs PNG); map is the fallback
  const media = state.media || MEDIA[kind] || "image";
  return (
    <div
      className="mt-2 rounded-md overflow-hidden flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.35)", minHeight: 96 }}
    >
      {state.status === "idle" && (
        <button
          className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md"
          style={{ color: "var(--adm-cyan-2)", border: "1px solid var(--adm-border)" }}
          onClick={load}
        >
          {media === "audio" ? <Volume2 size={12} /> : <Play size={12} />}
          Preview
        </button>
      )}
      {state.status === "loading" && (
        <Loader2 size={16} className="animate-spin" style={{ color: "var(--adm-text-4)" }} />
      )}
      {state.status === "error" && (
        <span className="text-[11px]" style={{ color: "var(--adm-text-4)" }}>
          preview unavailable
        </span>
      )}
      {state.status === "ready" && media === "image" && (
        <img src={state.url} alt={itemId} className="w-full h-auto" style={{ maxHeight: 200, objectFit: "contain" }} />
      )}
      {state.status === "ready" && media === "video" && (
        <video src={state.url} className="w-full" style={{ maxHeight: 200 }} autoPlay loop muted playsInline />
      )}
      {state.status === "ready" && media === "video_audio" && (
        // has a soundtrack (e.g. style-pack mini-trailer): browsers block
        // autoplay with audio, so give controls instead of autoplaying muted
        <video src={state.url} className="w-full" style={{ maxHeight: 200 }} controls loop playsInline />
      )}
      {state.status === "ready" && media === "audio" && (
        <audio src={state.url} controls autoPlay className="w-full px-2 py-3" />
      )}
    </div>
  );
}

function FeatureCard({ item, previewKind }) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "var(--adm-card)", border: "1px solid var(--adm-border)" }}
    >
      <div className="text-[12px] font-semibold truncate" style={{ color: "var(--adm-text)" }} title={item.label}>
        {item.label}
      </div>
      <div className="text-[10px] mt-0.5 font-mono truncate" style={{ color: "var(--adm-text-5)" }}>
        {item.id}
      </div>
      <div className="text-[11px] mt-1.5 leading-snug" style={{ color: "var(--adm-text-3)" }}>
        {item.used_for}
      </div>
      {previewKind && <PreviewBox kind={previewKind} itemId={item.id} />}
    </div>
  );
}

export default function AdminEditingFeatures() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [active, setActive] = useState(null);
  const [q, setQ] = useState("");
  const [creations, setCreations] = useState(null);  // every USER creation

  useEffect(() => {
    api.adminEditingFeatures()
      .then((d) => {
        setData(d);
        if (d.sections?.length) setActive(d.sections[0].key);
      })
      .catch((e) => setErr(e?.message || "failed to load catalog"));
    api.adminUserCreations().then(setCreations).catch(() => setCreations(null));
  }, []);

  const section = useMemo(
    () => data?.sections?.find((s) => s.key === active),
    [data, active]
  );
  const items = useMemo(() => {
    if (!section) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return section.items;
    return section.items.filter(
      (i) =>
        i.id.toLowerCase().includes(needle) ||
        i.label.toLowerCase().includes(needle) ||
        (i.used_for || "").toLowerCase().includes(needle)
    );
  }, [section, q]);

  if (err)
    return (
      <div className="text-sm" style={{ color: "var(--adm-text-3)" }}>{err}</div>
    );
  if (!data)
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--adm-text-4)" }}>
        <Loader2 size={14} className="animate-spin" /> Loading catalog…
      </div>
    );

  const total = Object.values(data.totals || {}).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="mb-4">
        <div className="text-sm" style={{ color: "var(--adm-text-2)" }}>
          Everything the editing engine can do — <b>{total}</b> catalogued features.
          Click <i>Preview</i> on any card to render a live dummy of that exact effect.
        </div>
      </div>

      {/* Section chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {data.sections.map((s) => (
          <button
            key={s.key}
            onClick={() => { setActive(s.key); setQ(""); }}
            className="text-[11px] px-2.5 py-1 rounded-full transition-colors"
            style={
              s.key === active
                ? { background: "var(--adm-violet)", color: "#fff" }
                : { border: "1px solid var(--adm-border)", color: "var(--adm-text-3)" }
            }
          >
            {s.label.split("(")[0].trim()} · {data.totals[s.key]}
          </button>
        ))}
      </div>

      {section && (
        <>
          <div className="flex items-center justify-between mb-3 gap-3">
            <div className="text-[12px] font-semibold" style={{ color: "var(--adm-text-2)" }}>
              {section.label}
            </div>
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "var(--adm-text-5)" }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter…"
                className="text-[11px] pl-7 pr-2 py-1.5 rounded-md outline-none"
                style={{ background: "var(--adm-card)", border: "1px solid var(--adm-border)", color: "var(--adm-text)" }}
              />
            </div>
          </div>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
          >
            {items.map((it) => (
              <FeatureCard key={it.id} item={it} previewKind={section.preview_kind} />
            ))}
          </div>
          {!items.length && (
            <div className="text-[12px] mt-6" style={{ color: "var(--adm-text-4)" }}>
              Nothing matches “{q}”.
            </div>
          )}
        </>
      )}

      {/* USER CREATIONS — every style pack / template users built.
          Private to their owners in the app; fully visible here. */}
      {creations && (creations.style_packs?.length || creations.templates?.length) ? (
        <div className="mt-8 pt-5" style={{ borderTop: "1px solid var(--adm-border)" }}>
          <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--adm-text-2)" }}>
            User creations
            <span className="font-normal ml-2" style={{ color: "var(--adm-text-4)" }}>
              — {creations.style_packs?.length || 0} mixed styles · {creations.templates?.length || 0} templates
            </span>
          </div>
          {creations.style_packs?.length > 0 && (
            <div className="grid gap-3 mb-4"
                 style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
              {creations.style_packs.map((p) => (
                <div key={p.key} className="rounded-lg p-3"
                     style={{ background: "var(--adm-card)", border: "1px solid var(--adm-border)" }}>
                  <div className="text-[12px] font-semibold" style={{ color: "var(--adm-text)" }}>🎨 {p.name}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--adm-text-5)" }}>{p.owner}</div>
                  <div className="text-[10px] mt-1.5" style={{ color: "var(--adm-text-3)" }}>
                    look: {p.look} · motion: {p.motion} · sound: {p.sound} · cards: {p.cards}
                  </div>
                </div>
              ))}
            </div>
          )}
          {creations.templates?.length > 0 && (
            <div className="grid gap-3"
                 style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
              {creations.templates.map((t) => (
                <div key={t.id} className="rounded-lg overflow-hidden"
                     style={{ background: "var(--adm-card)", border: "1px solid var(--adm-border)" }}>
                  <img src={t.preview_url} alt={t.name}
                       className="w-full aspect-video object-cover" style={{ background: "#000" }} />
                  <div className="p-2">
                    <div className="text-[11px] font-semibold truncate" style={{ color: "var(--adm-text)" }}>{t.name}</div>
                    <div className="text-[10px]" style={{ color: "var(--adm-text-5)" }}>
                      {t.owner} · {t.visibility}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
