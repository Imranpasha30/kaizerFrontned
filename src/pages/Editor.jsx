import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Download, Upload, Loader2, ChevronLeft, ChevronRight, Settings, Eye, Sparkles, Youtube } from "lucide-react";
import { api } from "../api/client";
import LivePreview from "../components/LivePreview";
import SEOPanel from "../components/SEOPanel";
import PublishModal from "../components/PublishModal";

const FONTS = [
  "Ponnala-Regular.ttf", "NotoSansTelugu-Bold.ttf", "NotoSerifTelugu-Bold.ttf",
  "HindGuntur-Bold.ttf", "Gurajada-Regular.ttf", "Ramabhadra-Regular.ttf",
  "TenaliRamakrishna-Regular.ttf", "Timmana-Regular.ttf",
];

function Label({ children }) {
  return <label className="text-xs text-gray-500 w-20 xl:w-24 flex-shrink-0">{children}</label>;
}
function Row({ children }) {
  return <div className="flex items-center gap-2 min-h-[28px]">{children}</div>;
}
function SectionHead({ children }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-widest text-accent border-b border-border pb-1 mt-4 mb-2 first:mt-0">
      {children}
    </div>
  );
}

export default function Editor() {
  const { jobId, clipId: urlClipId } = useParams();
  const [job, setJob]         = useState(null);
  const [clips, setClips]     = useState([]);
  const [curIdx, setCurIdx]   = useState(0);
  const [clip, setClip]       = useState(null);
  // Right panel width is user-draggable + persisted.  Defaults to 320px.
  const [rightWidth, setRightWidth] = useState(() => {
    const v = Number(localStorage.getItem("kaizer_editor_right_px") || 0);
    return v >= 260 && v <= 900 ? v : 320;
  });
  useEffect(() => {
    localStorage.setItem("kaizer_editor_right_px", String(rightWidth));
  }, [rightWidth]);
  const [rendering, setRendering] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dlPct, setDlPct]     = useState(null);
  const [imgTs, setImgTs]     = useState(Date.now());
  const [vidTs, setVidTs]     = useState(Date.now());
  const [error, setError]     = useState("");

  // Mobile panel toggle: "preview" | "controls"
  const [mobilePanel, setMobilePanel] = useState("preview");
  // Publish-to-YouTube modal state.  Clip ID comes from the currently-selected
  // clip so the button on any clip works without extra navigation.
  const [publishOpen, setPublishOpen] = useState(false);
  const navigate = useNavigate();

  // Right sidebar tab: "style" | "seo"
  const [rightTab, setRightTab] = useState("style");

  // Editable fields
  const [text, setText]           = useState("");
  const [fontSize, setFontSize]   = useState(52);
  const [textColor, setTextColor] = useState("#ffffff");
  const [fontFile, setFontFile]   = useState(FONTS[0]);
  const [secVideo, setSecVideo]   = useState(46.19);
  const [secText, setSecText]     = useState(16.91);
  const [secImage, setSecImage]   = useState(36.90);

  // Card style
  const [bgr0, setBgr0]   = useState(193);
  const [bgr1, setBgr1]   = useState(128);
  const [edge, setEdge]   = useState(9);
  const [jag, setJag]     = useState(60);
  const [seed, setSeed]   = useState(7);
  const [vsid, setVsid]   = useState(35);
  const [vcor, setVcor]   = useState(72);
  const [vwid, setVwid]   = useState(74);
  const [overlap, setOverlap] = useState(20);

  // Follow bar
  const [fbText, setFbText]   = useState("FOLLOW KAIZER NEWS TELUGU");
  const [fbTextColor, setFbTextColor] = useState("#ffffff");
  const [fbBg, setFbBg]       = useState("#1a0a2e");
  const [fbTc, setFbTc]       = useState("#ffff00");

  // Load job + clips
  useEffect(() => {
    api.getJob(jobId).then(j => {
      setJob(j);
      setClips(j.clips || []);
      const idx = urlClipId ? j.clips.findIndex(c => String(c.id) === String(urlClipId)) : 0;
      setCurIdx(Math.max(0, idx));
    });
  }, [jobId, urlClipId]);

  // Populate controls when clip changes
  useEffect(() => {
    const c = clips[curIdx];
    if (!c) return;
    setClip(c);
    setText(c.text || "");
    setFontSize(c.card_params?.font_size || 52);
    setTextColor(c.card_params?.text_color || "#ffffff");
    setFontFile(c.card_params?.font_file || FONTS[0]);

    const sp = c.section_pct || {};
    setSecVideo(+(sp.video * 100 || 46.19).toFixed(2));
    setSecText(+(sp.text  * 100 || 16.91).toFixed(2));
    setSecImage(+(sp.image* 100 || 36.90).toFixed(2));

    const cs = c.card_params?.card_style || {};
    setBgr0(cs.bgr0 ?? 193); setBgr1(cs.bgr1 ?? 128);
    setEdge(cs.edge ?? 9);   setJag(cs.jag ?? 60);
    setSeed(cs.seed ?? 7);   setVsid(cs.vsid ?? 35);
    setVcor(cs.vcor ?? 72);  setVwid(cs.vwid ?? 74);
    setOverlap(cs.overlap ?? 20);

    const fp = c.follow_params || {};
    setFbText(fp.follow_text || "FOLLOW KAIZER NEWS TELUGU");
    setFbTextColor(fp.follow_text_color || "#ffffff");
    setFbBg(fp.bg_color || "#1a0a2e");
    setFbTc(fp.text_color || "#ffff00");
  }, [curIdx, clips]);

  async function rerender() {
    if (!clip) return;
    setRendering(true);
    setError("");
    try {
      const edits = {
        frame_type: clip.frame_type,
        text, font_size: fontSize, text_color: textColor, font_file: fontFile,
        section_pct: {
          video: secVideo / 100,
          text:  secText  / 100,
          image: secImage / 100,
        },
        card_style: { bgr0, bgr1, edge, jag, seed, vsid, vcor, vwid, overlap },
        follow_params: {
          follow_text: fbText,
          follow_text_color: fbTextColor,
          bg_color: fbBg,
          text_color: fbTc,
          velvet_style: (clip.follow_params || {}).velvet_style || null,
        },
      };
      const updated = await api.rerenderClip(clip.id, edits);
      const newClips = clips.map(c => c.id === updated.id ? updated : c);
      setClips(newClips);
      setClip(updated);
      setImgTs(Date.now());
      setVidTs(Date.now());
    } catch (e) {
      setError(e.message);
    } finally {
      setRendering(false);
    }
  }

  async function uploadImage(e) {
    const file = e.target.files[0];
    if (!file || !clip) return;
    const form = new FormData();
    form.append("image", file);
    try {
      const res = await api.uploadImage(clip.id, form);
      const newClips = clips.map(c => c.id === clip.id ? { ...c, image_path: res.image_path, image_url: res.image_url } : c);
      setClips(newClips);
      setClip(prev => ({ ...prev, image_path: res.image_path, image_url: res.image_url }));
    } catch (e) {
      setError(e.message);
    }
  }

  async function doExport() {
    setExporting(true);
    try {
      await api.exportJob(jobId);
      alert("Export complete!");
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }

  const thumbUrl = clip?.thumb_url ? api.mediaUrl(clip.thumb_url) + "&t=" + imgTs : "";
  const videoUrl = clip?.video_url ? api.mediaUrl(clip.video_url) + "&t=" + vidTs : "";
  const isTorn   = clip?.frame_type === "torn_card";
  const isFollow = clip?.frame_type === "follow_bar";

  if (!job) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-gray-600" />
      </div>
    );
  }

  /* ── Shared sub-components ─────────────────────────────── */

  const clipStrip = (
    <div className="flex md:flex-col gap-2 p-2 overflow-x-auto md:overflow-y-auto md:overflow-x-hidden">
      {clips.map((c, i) => (
        <button
          key={c.id}
          onClick={() => setCurIdx(i)}
          className={`rounded overflow-hidden border-2 transition-colors relative flex-shrink-0
            w-16 md:w-full
            ${i === curIdx ? "border-accent" : "border-transparent hover:border-gray-600"}`}
        >
          {c.thumb_url ? (
            <img src={api.mediaUrl(c.thumb_url) + "&t=" + imgTs} alt="" className="w-full aspect-[9/16] object-cover block" />
          ) : (
            <div className="w-full aspect-[9/16] bg-surface flex items-center justify-center text-gray-600 text-xs">
              {i + 1}
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[9px] text-center py-0.5 text-gray-300">
            #{i + 1}
          </div>
        </button>
      ))}
    </div>
  );

  const previewArea = (
    <div
      className="flex-1 flex flex-col items-center justify-center p-3 sm:p-4 gap-3 sm:gap-4 overflow-hidden min-h-0 relative"
      style={{
        // Canvas-style dot grid — radial-gradient dots on a dark base.
        backgroundColor: "#060606",
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1.5px)",
        backgroundSize: "22px 22px",
        backgroundPosition: "0 0",
      }}
    >
      {/* Subtle vignette over the dots so preview pops */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)",
        }}
      />
      {/* Live preview */}
      <div className="relative shadow-2xl flex-1 flex items-center justify-center min-h-0 z-[1]">
        <LivePreview
          rawUrl={clip?.raw_url}
          videoUrl={clip?.video_url}
          imageUrl={clip?.image_url}
          frameType={clip?.frame_type}
          text={text}
          fontFile={fontFile}
          fontSize={fontSize}
          textColor={textColor}
          bgColor={fbBg}
          followText={fbText}
          followTextColor={fbTextColor}
          fbBg={fbBg}
          fbTitleColor={fbTc}
          sectionPct={{
            video: secVideo / 100,
            text:  secText  / 100,
            image: secImage / 100,
          }}
          cardStyle={{ bgr0, bgr1, edge, jag, seed, vsid, vcor, vwid, overlap }}
          width={270}
        />
        {rendering && (
          <div className="absolute inset-0 bg-black/60 rounded flex items-center justify-center">
            <Loader2 size={32} className="animate-spin text-accent" />
          </div>
        )}
      </div>

      {/* Clip nav + download */}
      <div className="flex items-center gap-3 flex-shrink-0 relative z-[1]">
        <button onClick={() => setCurIdx(i => Math.max(0, i - 1))} disabled={curIdx === 0}
          className="btn btn-secondary py-1 px-2 disabled:opacity-30">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm text-gray-400 tabular-nums">{curIdx + 1} / {clips.length}</span>
        <button onClick={() => setCurIdx(i => Math.min(clips.length - 1, i + 1))} disabled={curIdx === clips.length - 1}
          className="btn btn-secondary py-1 px-2 disabled:opacity-30">
          <ChevronRight size={16} />
        </button>
        {videoUrl && (
          <button
            onClick={async () => {
              setDlPct(0);
              try {
                await api.downloadFile(videoUrl, clip?.filename || `clip_${curIdx + 1}.mp4`, pct => setDlPct(pct));
              } catch {
                setError("Download failed \u2014 file may have expired after redeploy");
              } finally {
                setDlPct(null);
              }
            }}
            disabled={dlPct !== null}
            className="btn btn-green py-1 px-2 flex items-center gap-1 text-xs ml-2">
            {dlPct !== null
              ? <><Loader2 size={14} className="animate-spin" /> {dlPct >= 0 ? `${dlPct}%` : "Preparing\u2026"}</>
              : <><Download size={14} /> Download</>}
          </button>
        )}
      </div>
    </div>
  );

  const tabsBar = (
    <div className="flex border-b border-border flex-shrink-0 bg-[#0a0a0a]">
      <button
        onClick={() => setRightTab("style")}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors
          ${rightTab === "style" ? "text-accent2 border-b-2 border-accent2" : "text-gray-500 hover:text-gray-300"}`}
      >
        <Settings size={13} /> Styling
      </button>
      <button
        onClick={() => setRightTab("seo")}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors
          ${rightTab === "seo" ? "text-accent2 border-b-2 border-accent2" : "text-gray-500 hover:text-gray-300"}`}
      >
        <Sparkles size={13} /> SEO
        {clip?.seo && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
      </button>
    </div>
  );

  const seoPanel = (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="p-3 border-b border-border flex items-center gap-2 flex-shrink-0">
        <Link to={`/jobs/${jobId}`} className="btn btn-secondary py-1 px-2">
          <ArrowLeft size={14} />
        </Link>
        <span className="text-xs text-gray-400 flex-1 truncate">{job.video_name}</span>
        <button
          onClick={() => setPublishOpen(true)}
          disabled={!clip}
          title={clip?.seo ? "Publish this clip to YouTube" : "Generate SEO first, then publish"}
          className="btn py-1 px-2 flex items-center gap-1 text-xs bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Youtube size={12} /> Publish
        </button>
        <button onClick={doExport} disabled={exporting} className="btn btn-green py-1 px-2 flex items-center gap-1 text-xs" title="Export rendered MP4">
          {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
        </button>
      </div>
      {tabsBar}
      <SEOPanel
        clip={clip}
        onSeoChange={(newSeo) => {
          if (!clip) return;
          const updated = { ...clip, seo: newSeo };
          setClip(updated);
          setClips((list) => list.map((c) => c.id === clip.id ? updated : c));
        }}
      />
    </div>
  );

  const controlsPanel = (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center gap-2 flex-shrink-0">
        <Link to={`/jobs/${jobId}`} className="btn btn-secondary py-1 px-2">
          <ArrowLeft size={14} />
        </Link>
        <span className="text-xs text-gray-400 flex-1 truncate">{job.video_name}</span>
        <button
          onClick={() => setPublishOpen(true)}
          disabled={!clip}
          title={clip?.seo ? "Publish this clip to YouTube" : "Generate SEO first, then publish"}
          className="btn py-1 px-2 flex items-center gap-1 text-xs bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Youtube size={12} /> Publish
        </button>
        <button onClick={doExport} disabled={exporting} className="btn btn-green py-1 px-2 flex items-center gap-1 text-xs" title="Export rendered MP4">
          {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
        </button>
      </div>

      {tabsBar}

      <div className="p-3 flex-1 overflow-y-auto">
        {error && <p className="text-red-400 text-xs mb-3 bg-red-950/30 p-2 rounded">{error}</p>}

        {/* Text */}
        <SectionHead>Headline Text</SectionHead>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          className="w-full bg-surface border border-border text-gray-200 text-xs p-2 rounded resize-y min-h-[60px] focus:outline-none focus:border-accent"
        />

        {/* Font controls */}
        <SectionHead>Font</SectionHead>
        <Row>
          <Label>Font</Label>
          <select value={fontFile} onChange={e => setFontFile(e.target.value)}
            className="flex-1 bg-surface border border-border text-gray-300 text-xs p-1.5 rounded">
            {FONTS.map(f => <option key={f} value={f}>{f.replace(".ttf", "").replace("-", " ")}</option>)}
          </select>
        </Row>
        <Row>
          <Label>Size</Label>
          <input type="range" min="16" max="120" value={fontSize} onChange={e => setFontSize(+e.target.value)} className="flex-1" />
          <span className="text-xs text-gray-400 w-8 text-right tabular-nums">{fontSize}</span>
        </Row>
        <Row>
          <Label>Color</Label>
          <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}
            className="w-7 h-7 border border-border rounded bg-surface p-0.5" />
          <span className="text-xs text-gray-500">{textColor}</span>
        </Row>

        {/* Image */}
        <SectionHead>Image</SectionHead>
        <label className="flex items-center gap-2 cursor-pointer border border-dashed border-border rounded p-2.5 hover:border-gray-500 transition-colors">
          <Upload size={14} className="text-gray-500" />
          <span className="text-xs text-gray-400">Replace image</span>
          <input type="file" accept="image/*" className="hidden" onChange={uploadImage} />
        </label>

        {/* Sections — only for torn_card */}
        {isTorn && (
          <>
            <SectionHead>Sections</SectionHead>
            {[
              ["Video %",  secVideo, setSecVideo],
              ["Text %",   secText,  setSecText],
              ["Image %",  secImage, setSecImage],
            ].map(([lbl, val, set]) => (
              <Row key={lbl}>
                <Label>{lbl}</Label>
                <input type="range" min="5" max="80" step="0.5" value={val}
                  onChange={e => set(+e.target.value)} className="flex-1" />
                <span className="text-xs text-gray-400 w-10 text-right tabular-nums">{val.toFixed(1)}%</span>
              </Row>
            ))}

            <SectionHead>Card Style</SectionHead>
            {[
              ["Top red",    bgr0, setBgr0, 120, 255],
              ["Bot red",    bgr1, setBgr1,  60, 200],
              ["Edge h",     edge, setEdge,   2,  40],
              ["Jaggedness", jag,  setJag,   10, 100],
              ["Seed",       seed, setSeed,   0,  99],
              ["Side str",   vsid, setVsid,   0,  80],
              ["Corner",     vcor, setVcor,   0, 100],
              ["Side w",     vwid, setVwid,  20, 300],
              ["Overlap",    overlap, setOverlap, 5, 80],
            ].map(([lbl, val, set, mn, mx]) => (
              <Row key={lbl}>
                <Label>{lbl}</Label>
                <input type="range" min={mn} max={mx} value={val}
                  onChange={e => set(+e.target.value)} className="flex-1" />
                <span className="text-xs text-gray-400 w-8 text-right tabular-nums">{val}</span>
              </Row>
            ))}
          </>
        )}

        {/* Follow bar controls */}
        {isFollow && (
          <>
            <SectionHead>Follow Bar</SectionHead>
            <Row>
              <Label>Follow text</Label>
              <input value={fbText} onChange={e => setFbText(e.target.value)}
                className="flex-1 bg-surface border border-border text-gray-300 text-xs p-1.5 rounded" />
            </Row>
            <Row>
              <Label>Text color</Label>
              <input type="color" value={fbTextColor} onChange={e => setFbTextColor(e.target.value)}
                className="w-7 h-7 border border-border rounded bg-surface p-0.5" />
            </Row>
            <Row>
              <Label>BG color</Label>
              <input type="color" value={fbBg} onChange={e => setFbBg(e.target.value)}
                className="w-7 h-7 border border-border rounded bg-surface p-0.5" />
            </Row>
            <Row>
              <Label>Title color</Label>
              <input type="color" value={fbTc} onChange={e => setFbTc(e.target.value)}
                className="w-7 h-7 border border-border rounded bg-surface p-0.5" />
            </Row>
          </>
        )}
      </div>

      {/* Re-render button */}
      <div className="p-3 border-t border-border flex-shrink-0">
        <button
          onClick={rerender}
          disabled={rendering}
          className="btn btn-primary w-full flex items-center justify-center gap-2"
        >
          {rendering
            ? <><Loader2 size={14} className="animate-spin" /> Rendering&hellip;</>
            : <><RefreshCw size={14} /> Re-render Clip</>}
        </button>
      </div>
    </div>
  );

  /* ── Layout ────────────────────────────────────────────── */
  return (
    <>
      {/* ===== DESKTOP (md+): 3-column layout ===== */}
      <div className="hidden md:flex h-[calc(100vh-48px)] overflow-hidden">
        {/* Left: clip strip */}
        <div className="w-20 lg:w-24 bg-[#0c0c0c] border-r border-border overflow-y-auto flex-shrink-0">
          {clipStrip}
        </div>

        {/* Center: preview */}
        <div className="flex-1 flex flex-col bg-[#060606] min-w-0">
          {previewArea}
        </div>

        {/* Drag handle — resizes right panel. Persists to localStorage. */}
        <div
          role="separator"
          title="Drag to resize"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = rightWidth;
            function onMove(ev) {
              const dx = startX - ev.clientX;        // dragging left grows the panel
              const next = Math.max(260, Math.min(900, startW + dx));
              setRightWidth(next);
            }
            function onUp() {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
              document.body.style.cursor = "";
              document.body.style.userSelect = "";
            }
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
          onDoubleClick={() => setRightWidth(320)}
          className="w-1.5 bg-black hover:bg-accent2/70 cursor-col-resize flex-shrink-0 transition-colors"
        />

        {/* Right: controls / SEO */}
        <div
          className="bg-[#0e0e0e] border-l border-border flex flex-col flex-shrink-0"
          style={{ width: rightWidth }}
        >
          {rightTab === "seo" ? seoPanel : controlsPanel}
        </div>
      </div>

      {/* ===== MOBILE (<md): stacked with toggle ===== */}
      <div className="md:hidden flex flex-col h-[calc(100vh-48px)] overflow-hidden">
        {/* Clip strip — horizontal scroll */}
        <div className="bg-[#0c0c0c] border-b border-border flex-shrink-0 overflow-x-auto">
          {clipStrip}
        </div>

        {/* Toggle bar */}
        <div className="flex border-b border-border flex-shrink-0 bg-[#0a0a0a]">
          <button
            onClick={() => setMobilePanel("preview")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors
              ${mobilePanel === "preview" ? "text-accent2 border-b-2 border-accent2" : "text-gray-500"}`}
          >
            <Eye size={14} /> Preview
          </button>
          <button
            onClick={() => setMobilePanel("controls")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors
              ${mobilePanel === "controls" ? "text-accent2 border-b-2 border-accent2" : "text-gray-500"}`}
          >
            <Settings size={14} /> Controls
          </button>
        </div>

        {/* Active panel */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {mobilePanel === "preview" ? (
            <div className="flex-1 flex flex-col bg-[#060606] min-h-0">
              {previewArea}
            </div>
          ) : (
            <div className="flex-1 flex flex-col bg-[#0e0e0e] min-h-0 overflow-y-auto">
              {rightTab === "seo" ? seoPanel : controlsPanel}
            </div>
          )}
        </div>
      </div>

      {/* Publish-to-YouTube modal — operates on the CURRENTLY-SELECTED clip
          so the user can fire it from any panel without leaving the editor.
          On publish, route to /uploads to watch the upload progress. */}
      <PublishModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        clip={clip}
        jobId={jobId}
        onPublished={() => {
          setPublishOpen(false);
          navigate("/uploads");
        }}
      />
    </>
  );
}
