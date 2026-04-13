import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, Download, Upload, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../api/client";

const FONTS = [
  "Ponnala-Regular.ttf", "NotoSansTelugu-Bold.ttf", "NotoSerifTelugu-Bold.ttf",
  "HindGuntur-Bold.ttf", "Gurajada-Regular.ttf", "Ramabhadra-Regular.ttf",
  "TenaliRamakrishna-Regular.ttf", "Timmana-Regular.ttf",
];

function Label({ children }) {
  return <label className="text-xs text-gray-500 w-24 flex-shrink-0">{children}</label>;
}
function Row({ children }) {
  return <div className="flex items-center gap-2 min-h-[28px]">{children}</div>;
}
function SectionHead({ children }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-widest text-accent border-b border-border pb-1 mt-4 mb-2">
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
  const [rendering, setRendering] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [imgTs, setImgTs]     = useState(Date.now());
  const [error, setError]     = useState("");

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
      // Update clip in list
      const newClips = clips.map(c => c.id === updated.id ? updated : c);
      setClips(newClips);
      setClip(updated);
      setImgTs(Date.now());
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
      alert("Export complete! Check the export/ folder.");
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }

  const thumbUrl = clip?.thumb_url ? api.mediaUrl(clip.thumb_url) + "&t=" + imgTs : "";
  const videoUrl = clip?.video_url ? api.mediaUrl(clip.video_url) : "";
  const isTorn   = clip?.frame_type === "torn_card";
  const isFollow = clip?.frame_type === "follow_bar";

  if (!job) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-gray-600" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-48px)] overflow-hidden">

      {/* ── Left: clip strip ─────────────────────────────── */}
      <div className="w-24 bg-[#0c0c0c] border-r border-border overflow-y-auto flex flex-col gap-2 p-2 flex-shrink-0">
        {clips.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setCurIdx(i)}
            className={`rounded overflow-hidden border-2 transition-colors relative
              ${i === curIdx ? "border-accent" : "border-transparent hover:border-gray-600"}`}
          >
            {c.thumb_url ? (
              <img src={api.mediaUrl(c.thumb_url) + "&t=" + imgTs} alt="" className="w-full aspect-[9/16] object-cover block" />
            ) : (
              <div className="w-full aspect-[9/16] bg-[#111] flex items-center justify-center text-gray-600 text-xs">
                {i + 1}
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[9px] text-center py-0.5 text-gray-300">
              #{i + 1}
            </div>
          </button>
        ))}
      </div>

      {/* ── Center: preview ───────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-[#060606] p-4 gap-4 overflow-hidden">
        {/* Clip preview — video player with thumbnail fallback */}
        <div className="relative shadow-2xl" style={{ height: "calc(100% - 56px)", aspectRatio: "9/16", maxHeight: "600px" }}>
          {videoUrl ? (
            <video
              key={videoUrl + imgTs}
              src={videoUrl}
              poster={thumbUrl}
              controls
              loop
              className="w-full h-full object-cover rounded bg-black"
            />
          ) : thumbUrl ? (
            <img src={thumbUrl} alt="preview" className="w-full h-full object-cover rounded" />
          ) : (
            <div className="w-full h-full bg-[#111] rounded flex items-center justify-center text-gray-600">
              No preview
            </div>
          )}
          {rendering && (
            <div className="absolute inset-0 bg-black/60 rounded flex items-center justify-center">
              <Loader2 size={32} className="animate-spin text-accent" />
            </div>
          )}
        </div>

        {/* Clip nav + download */}
        <div className="flex items-center gap-3">
          <button onClick={() => setCurIdx(i => Math.max(0, i - 1))} disabled={curIdx === 0}
            className="btn btn-secondary py-1 px-2 disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-gray-400">{curIdx + 1} / {clips.length}</span>
          <button onClick={() => setCurIdx(i => Math.min(clips.length - 1, i + 1))} disabled={curIdx === clips.length - 1}
            className="btn btn-secondary py-1 px-2 disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
          {videoUrl && (
            <a href={videoUrl} download={clip?.filename || `clip_${curIdx + 1}.mp4`}
              className="btn btn-green py-1 px-2 flex items-center gap-1 text-xs ml-2">
              <Download size={14} /> Download
            </a>
          )}
        </div>
      </div>

      {/* ── Right: controls ───────────────────────────────── */}
      <div className="w-64 bg-[#0e0e0e] border-l border-border overflow-y-auto flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Link to={`/jobs/${jobId}`} className="btn btn-secondary py-1 px-2">
            <ArrowLeft size={14} />
          </Link>
          <span className="text-xs text-gray-400 flex-1 truncate">{job.video_name}</span>
          <button onClick={doExport} disabled={exporting} className="btn btn-green py-1 px-2 flex items-center gap-1 text-xs">
            {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          </button>
        </div>

        <div className="p-3 flex-1">
          {error && <p className="text-red-400 text-xs mb-3 bg-red-950/30 p-2 rounded">{error}</p>}

          {/* Text */}
          <SectionHead>Headline Text</SectionHead>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-full bg-[#141414] border border-border text-gray-200 text-xs p-2 rounded resize-y min-h-[60px] focus:outline-none focus:border-accent"
          />

          {/* Font controls */}
          <SectionHead>Font</SectionHead>
          <Row>
            <Label>Font</Label>
            <select value={fontFile} onChange={e => setFontFile(e.target.value)}
              className="flex-1 bg-[#141414] border border-border text-gray-300 text-xs p-1.5 rounded">
              {FONTS.map(f => <option key={f} value={f}>{f.replace(".ttf", "").replace("-", " ")}</option>)}
            </select>
          </Row>
          <Row>
            <Label>Size</Label>
            <input type="range" min="16" max="120" value={fontSize} onChange={e => setFontSize(+e.target.value)} className="flex-1" />
            <span className="text-xs text-gray-400 w-8 text-right">{fontSize}</span>
          </Row>
          <Row>
            <Label>Color</Label>
            <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}
              className="w-7 h-7 border border-border rounded bg-[#111] p-0.5 cursor-pointer" />
            <span className="text-xs text-gray-500">{textColor}</span>
          </Row>

          {/* Image */}
          <SectionHead>Image</SectionHead>
          <label className="flex items-center gap-2 cursor-pointer border border-dashed border-border rounded p-2 hover:border-gray-500 transition-colors">
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
                  <span className="text-xs text-gray-400 w-10 text-right">{val.toFixed(1)}%</span>
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
                  <span className="text-xs text-gray-400 w-8 text-right">{val}</span>
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
                  className="flex-1 bg-[#141414] border border-border text-gray-300 text-xs p-1.5 rounded" />
              </Row>
              <Row>
                <Label>Text color</Label>
                <input type="color" value={fbTextColor} onChange={e => setFbTextColor(e.target.value)}
                  className="w-7 h-7 border border-border rounded bg-[#111] p-0.5" />
              </Row>
              <Row>
                <Label>BG color</Label>
                <input type="color" value={fbBg} onChange={e => setFbBg(e.target.value)}
                  className="w-7 h-7 border border-border rounded bg-[#111] p-0.5" />
              </Row>
              <Row>
                <Label>Title color</Label>
                <input type="color" value={fbTc} onChange={e => setFbTc(e.target.value)}
                  className="w-7 h-7 border border-border rounded bg-[#111] p-0.5" />
              </Row>
            </>
          )}
        </div>

        {/* Re-render button */}
        <div className="p-3 border-t border-border">
          <button
            onClick={rerender}
            disabled={rendering}
            className="btn btn-primary w-full flex items-center justify-center gap-2"
          >
            {rendering
              ? <><Loader2 size={14} className="animate-spin" /> Rendering…</>
              : <><RefreshCw size={14} /> Re-render Clip</>}
          </button>
        </div>
      </div>
    </div>
  );
}
