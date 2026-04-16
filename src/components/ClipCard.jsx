import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Edit2, Film, Download, Loader2 } from "lucide-react";
import { api } from "../api/client";

export default function ClipCard({ clip, jobId, index }) {
  const thumbUrl = clip.thumb_url ? api.mediaUrl(clip.thumb_url) + "&t=" + Date.now() : "";
  const videoUrl = clip.video_url ? api.mediaUrl(clip.video_url) : "";
  const [dlPct, setDlPct] = useState(null);

  async function handleDownload() {
    setDlPct(0);
    try {
      await api.downloadFile(videoUrl, clip.filename || `clip_${index + 1}.mp4`, pct => setDlPct(pct));
    } catch (e) {
      alert(e.message);
    } finally {
      setDlPct(null);
    }
  }

  return (
    <div className="card overflow-hidden group hover:border-border-hover transition-all duration-150">
      {/* Thumbnail */}
      <div className="relative bg-black" style={{ aspectRatio: "9/16" }}>
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={`Clip ${index + 1}`}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600">
            <Film size={32} />
          </div>
        )}
        <div className="absolute top-1.5 left-1.5 bg-black/70 text-xs px-1.5 py-0.5 rounded text-gray-300 tabular-nums">
          #{index + 1}
        </div>
        <div className="absolute top-1.5 right-1.5 bg-accent/80 text-xs px-1.5 py-0.5 rounded text-white capitalize">
          {clip.frame_type?.replace("_", " ")}
        </div>
      </div>

      {/* Info */}
      <div className="p-2.5 sm:p-3 flex flex-col gap-2">
        <p className="text-xs text-gray-300 line-clamp-2 leading-relaxed min-h-[2.5rem]">
          {clip.text || <span className="text-gray-600">No text</span>}
        </p>
        {dlPct !== null && (
          <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-200 rounded-full"
              style={{ width: `${dlPct >= 0 ? dlPct : 100}%`, animation: dlPct < 0 ? "pulse 1s infinite" : "none" }}
            />
          </div>
        )}
        <div className="flex gap-1.5">
          <Link
            to={`/jobs/${jobId}/edit/${clip.id}`}
            className="btn btn-secondary flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5"
          >
            <Edit2 size={12} /> Edit
          </Link>
          {videoUrl && (
            <button
              onClick={handleDownload}
              disabled={dlPct !== null}
              className="btn btn-secondary flex items-center justify-center gap-1 text-xs py-1.5 px-2"
              title="Download clip"
            >
              {dlPct !== null
                ? <Loader2 size={12} className="animate-spin" />
                : <Download size={12} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
