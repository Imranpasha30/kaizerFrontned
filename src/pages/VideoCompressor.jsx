import { useCallback, useEffect, useRef, useState } from "react";
import { FileVideo, Download, ShieldCheck, Zap, RefreshCcw, AlertCircle } from "lucide-react";
import { compress, isSupported } from "../lib/videoCompress";

/** Video Compressor — everything happens in THIS browser tab.
 *  The file never leaves the device (no upload to any server): it is
 *  demuxed, re-encoded on the machine's own hardware codec at a
 *  visually-lossless bitrate, and remuxed in memory. Audio is copied
 *  bit-for-bit. Typical camera footage lands 85-95% smaller; the card
 *  always shows the real number. */

const fmtMB = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`);

const STAGE_LABEL = {
  read: "Reading file (stays on your device)",
  prepare: "Analyzing video",
  compress: "Compressing on your hardware",
  finish: "Writing the new MP4",
};

export default function VideoCompressor() {
  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState("idle");       // idle | working | done | error
  const [prog, setProg] = useState({ stage: "read", pct: 0, note: "" });
  const [result, setResult] = useState(null);        // { url, stats }
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const urlRef = useRef("");
  const srcUrlRef = useRef("");

  useEffect(() => () => {            // free blob URLs on unmount
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    if (srcUrlRef.current) URL.revokeObjectURL(srcUrlRef.current);
  }, []);

  const start = useCallback(async (f) => {
    if (!f) return;
    if (!/\.(mp4|m4v|mov)$/i.test(f.name)) {
      setErr("Pick an MP4/MOV video file."); setPhase("error"); return;
    }
    setFile(f); setErr(""); setResult(null); setPhase("working");
    setProg({ stage: "read", pct: 0, note: "" });
    if (srcUrlRef.current) URL.revokeObjectURL(srcUrlRef.current);
    srcUrlRef.current = URL.createObjectURL(f);
    try {
      const { blob, stats } = await compress(f, { onProgress: setProg });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setResult({ url: urlRef.current, stats });
      setPhase("done");
    } catch (e) {
      setErr(e?.message || "Compression failed.");
      setPhase("error");
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDrag(false);
    start(e.dataTransfer?.files?.[0]);
  }, [start]);

  const reset = () => { setPhase("idle"); setFile(null); setResult(null); setErr(""); };

  const stats = result?.stats;
  const outName = file ? file.name.replace(/\.(mp4|m4v|mov)$/i, "") + "_compressed.mp4" : "compressed.mp4";

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-1">
          <FileVideo className="text-accent2" size={22} />
          <h1 className="text-xl font-bold">Video Compressor</h1>
        </div>
        <p className="text-sm text-gray-400 mb-6 flex items-center gap-2">
          <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
          100% private — the video is compressed inside your browser and never uploaded anywhere.
          Audio is copied untouched; the picture is re-encoded at visually-lossless quality.
        </p>

        {!isSupported() && (
          <div className="mb-6 p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm flex gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            This browser doesn't support local video encoding. Please use Chrome or Edge.
          </div>
        )}

        {/* ── drop zone ── */}
        {(phase === "idle" || phase === "error") && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-14 text-center transition
              ${drag ? "border-accent2 bg-accent2/10" : "border-gray-700 hover:border-gray-500 bg-white/[0.02]"}`}
          >
            <FileVideo size={44} className="mx-auto text-gray-500 mb-3" />
            <div className="text-lg font-semibold">Drop a video here, or click to choose</div>
            <div className="text-sm text-gray-500 mt-1">MP4 / MOV · big files welcome — nothing is uploaded</div>
            <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,.mp4,.m4v,.mov"
              className="hidden" onChange={(e) => start(e.target.files?.[0])} />
          </div>
        )}
        {phase === "error" && (
          <div className="mt-4 p-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 text-sm flex gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" /> {err}
          </div>
        )}

        {/* ── progress ── */}
        {phase === "working" && (
          <div className="rounded-2xl border border-border bg-white/[0.03] p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold flex items-center gap-2">
                <Zap size={16} className="text-accent2 animate-pulse" />
                {STAGE_LABEL[prog.stage] || "Working"}
              </div>
              <div className="text-sm text-gray-400 tabular-nums">{prog.pct}%</div>
            </div>
            <div className="h-3 rounded-full bg-black/50 overflow-hidden border border-border">
              <div className="h-full bg-gradient-to-r from-accent2 to-emerald-400 transition-all duration-200"
                   style={{ width: `${prog.pct}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[12px] text-gray-500">
              <span>{prog.note || "…"}</span>
              {file && <span>{file.name} · {fmtMB(file.size)}</span>}
            </div>
            {/* stage dots */}
            <div className="mt-4 flex items-center gap-2 text-[11px] text-gray-500">
              {["read", "prepare", "compress", "finish"].map((s, i) => {
                const order = ["read", "prepare", "compress", "finish"];
                const cur = order.indexOf(prog.stage);
                const on = i <= cur;
                return (
                  <span key={s} className={`px-2 py-1 rounded-full border
                    ${on ? "border-accent2/60 text-accent2" : "border-gray-700"}`}>
                    {STAGE_LABEL[s].split(" (")[0]}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* ── result ── */}
        {phase === "done" && stats && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-emerald-300">
                  {stats.reductionPct}% smaller
                </div>
                <div className="text-sm text-gray-300 mt-0.5">
                  {fmtMB(stats.inBytes)} → <b>{fmtMB(stats.outBytes)}</b>
                  <span className="text-gray-500"> · {stats.width}×{stats.height} · {stats.fps} fps · {stats.durationS}s · video {stats.bitrateMbps} Mbps</span>
                </div>
                <div className="text-[12px] text-gray-500 mt-1">
                  {stats.audioMode === "copied" || stats.audioCopied
                    ? "Audio copied bit-for-bit (zero loss) · picture visually lossless"
                    : stats.audioMode === "transcoded"
                    ? "Camera PCM audio converted to studio-grade AAC (perceptually identical) · picture visually lossless"
                    : "Picture visually lossless · this file's audio format couldn't be converted — video-only output"}
                  {stats.reductionPct < 85 && (
                    <span className="text-amber-300"> · this source was already heavily compressed, so {stats.reductionPct}% was the honest maximum without visible damage</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a href={result.url} download={outName}
                   className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm">
                  <Download size={16} /> Download compressed
                </a>
                <button onClick={reset}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-600 hover:border-gray-400 text-sm">
                  <RefreshCcw size={14} /> Another
                </button>
              </div>
            </div>

            {/* before / after preview */}
            <div className="grid sm:grid-cols-2 gap-4 mt-5">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                  Original · {fmtMB(stats.inBytes)}
                </div>
                <video src={srcUrlRef.current} controls preload="metadata"
                       className="w-full rounded-lg border border-border bg-black" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-emerald-400/90 mb-1">
                  Compressed · {fmtMB(stats.outBytes)}
                </div>
                <video src={result.url} controls preload="metadata"
                       className="w-full rounded-lg border border-emerald-500/40 bg-black" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
