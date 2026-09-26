// Help Centre — the guides, played and read in place.
//
// The files themselves are NOT in this repo. They live in R2 and arrive as
// URLs from GET /api/help/guides, so adding next month's guide is an upload
// plus one entry in routers/help.py — no rebuild of this app, and none of the
// desktop's 4 GB installer. See that router's header for the whole reasoning.
//
// This page is deliberately register-agnostic: every colour is one of the
// shared classes (bg-panel, text-gray-*, border-border) that spa-theme.css
// remaps per light/dark, rather than a hardcoded hex. The website runs dark
// and the desktop runs light off the SAME file, and last night's lesson was
// that anything hardcoded here is invisible in one of them.
import React, { useEffect, useMemo, useState } from "react";
import {
  LifeBuoy, PlayCircle, FileText, Download,
  Loader2, AlertCircle, X,
} from "lucide-react";
import { api } from "../api/client";

function mb(bytes) {
  if (!bytes) return "";
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** The viewer, opened over the page — video AND PDF, both in here.
 *
 *  Nothing opens in a browser tab. This is a desktop application, and sending
 *  someone out of it to read its own documentation is the wrong direction;
 *  it also lands them on a storage URL, which is not their business. The PDF
 *  is rendered by an <iframe> at our own /api/help/asset/<id>: Electron is
 *  Chromium, so that gets the built-in PDF viewer with pages, zoom and search
 *  for free. It only works because the route streams rather than redirects —
 *  a frame pointed at a signed cross-origin URL would navigate away or be
 *  refused. */
function AssetViewer({ asset, onClose }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    // Nothing behind the overlay should scroll while it is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={asset.label}
    >
      <div
        className="w-full max-w-5xl bg-panel border border-border rounded-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <span className="text-sm font-semibold text-gray-100">
            {asset.label}
            <span className="ml-2 text-xs font-normal text-gray-500">
              {asset.language_label}
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded hover:bg-panel-hover text-gray-400 hover:text-gray-100"
          >
            <X size={18} />
          </button>
        </div>
        {asset.kind === "video" ? (
          /* controls only — no autoplay: a guide that starts talking the
             moment a panel opens is a guide people close. */
          <video
            src={asset.url}
            controls
            playsInline
            preload="metadata"
            className="w-full max-h-[75vh] bg-black"
          />
        ) : (
          /* A PDF needs page height to be readable, not a letterbox. */
          <iframe
            src={asset.url}
            title={asset.label}
            className="w-full h-[80vh] bg-white border-0"
          />
        )}
      </div>
    </div>
  );
}

function AssetRow({ asset, onOpen }) {
  const isVideo = asset.kind === "video";
  const Icon = isVideo ? PlayCircle : FileText;

  const body = (
    <>
      <Icon size={18} className="text-accent2 flex-shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-100 truncate">
          {asset.label}
        </span>
        <span className="block text-xs text-gray-500">
          {asset.language_label} · {isVideo ? "Video" : "PDF"}
          {asset.bytes ? ` · ${mb(asset.bytes)}` : ""}
        </span>
      </span>
    </>
  );

  const shell =
    "flex items-center gap-3 w-full px-3 py-2.5 rounded border border-border " +
    "bg-surface hover:bg-panel-hover transition-colors text-left";

  if (isVideo) {
    return (
      <button type="button" onClick={() => onOpen(asset)} className={shell}>
        {body}
        <PlayCircle size={16} className="ml-auto text-gray-500 flex-shrink-0" />
      </button>
    );
  }

  // The row opens the PDF in the in-app viewer. Download is a separate
  // control, because "read this now" and "keep a copy" are different
  // intentions and one link cannot serve both. Neither leaves the app —
  // the download is a save, not a navigation.
  return (
    <div className={shell}>
      <button
        type="button"
        onClick={() => onOpen(asset)}
        className="flex items-center gap-3 min-w-0 flex-1 text-left"
      >
        {body}
      </button>
      <a
        href={`${asset.url}?download=1`}
        download
        title="Download a copy"
        className="ml-auto p-1.5 rounded hover:bg-panel text-gray-400 hover:text-gray-100 flex-shrink-0"
      >
        <Download size={15} />
      </a>
    </div>
  );
}

export default function Help() {
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api.helpGuides();
        if (!alive) return;
        setGuides(Array.isArray(data) ? data : []);
      } catch (e) {
        if (alive) setError(e?.message || "Could not load the guides.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Grouped by topic so the list stays navigable as guides accumulate.
  const byTopic = useMemo(() => {
    const m = new Map();
    for (const g of guides) {
      const t = g.topic || "Guides";
      if (!m.has(t)) m.set(t, []);
      m.get(t).push(g);
    }
    return [...m.entries()];
  }, [guides]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-100 flex items-center gap-2">
          <LifeBuoy size={22} className="text-accent2" />
          Help Centre
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Step-by-step guides for Kaizer&nbsp;X, in English and Telugu.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
          <Loader2 size={16} className="animate-spin" />
          Loading the guides…
        </div>
      )}

      {!loading && error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && guides.length === 0 && (
        <p className="text-sm text-gray-500 py-8 text-center">
          No guides have been published yet.
        </p>
      )}

      {byTopic.map(([topic, items]) => (
        <section key={topic} className="mb-8">
          <h2 className="text-xs font-semibold tracking-widest uppercase text-gray-500 mb-3">
            {topic}
          </h2>
          {items.map((g) => (
            <article
              key={g.id}
              className="mb-4 p-4 bg-panel border border-border rounded-lg"
            >
              <h3 className="text-base font-semibold text-gray-100">{g.title}</h3>
              {g.summary && (
                <p className="text-sm text-gray-400 mt-1 mb-3 leading-relaxed">
                  {g.summary}
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {g.assets.map((a) => (
                  <AssetRow key={a.id} asset={a} onOpen={setViewing} />
                ))}
              </div>
            </article>
          ))}
        </section>
      ))}

      {viewing && (
        <AssetViewer asset={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}
