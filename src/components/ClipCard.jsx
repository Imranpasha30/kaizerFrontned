import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Edit2, Film, Download, Youtube, Sparkles } from "lucide-react";
import { api } from "../api/client";
import PublishModal from "./PublishModal";
import DownloadModal from "./DownloadModal";

export default function ClipCard({ clip, jobId, index }) {
  const thumbUrl = clip.thumb_url ? api.bustCache(api.mediaUrl(clip.thumb_url)) : "";
  const videoUrl = clip.video_url ? api.mediaUrl(clip.video_url) : "";
  const [showPublish, setShowPublish] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const navigate = useNavigate();
  const hasSeo = !!(clip.seo && clip.seo.title);

  return (
    <div className="card overflow-hidden group hover:border-border-hover transition-all duration-150">
      {/* Thumbnail — 16:9 for the bulletin (long-form YouTube Full
          output, 1920×1080), 9:16 for everything else (Shorts). */}
      <div
        className="relative bg-black"
        style={{ aspectRatio: clip.frame_type === "bulletin" ? "16/9" : "9/16" }}
      >
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
        {/* Button row — Edit grows but is allowed to shrink below its
            content width via ``min-w-0`` + ``truncate``, so the two
            icon-only action buttons (Publish / Download) on the right
            never get clipped by the card's ``overflow-hidden``. The
            ``shrink-0`` on the icon buttons pins their width so they
            stay perfectly square even when the row is tight. */}
        <div className="flex gap-1 items-stretch">
          <Link
            to={`/jobs/${jobId}/edit/${clip.id}`}
            className="btn btn-secondary flex-1 min-w-0 flex items-center justify-center gap-1.5 text-xs py-1.5"
            title={hasSeo ? "Edit clip" : "Edit clip — generate SEO here"}
          >
            <Edit2 size={12} className="shrink-0" />
            <span className="truncate">Edit</span>
            {hasSeo && <Sparkles size={10} className="text-accent2 shrink-0" />}
          </Link>
          {videoUrl && (
            <button
              type="button"
              onClick={() => setShowPublish(true)}
              className="btn shrink-0 flex items-center justify-center text-xs py-1.5 px-2 bg-accent/80 hover:bg-accent text-white border-transparent"
              title="Publish to YouTube"
              aria-label="Publish to YouTube"
            >
              <Youtube size={12} />
            </button>
          )}
          {videoUrl && (
            <button
              type="button"
              onClick={() => setShowDownload(true)}
              className="btn btn-secondary shrink-0 flex items-center justify-center text-xs py-1.5 px-2"
              title="Download with channel logo"
              aria-label="Download with channel logo"
            >
              <Download size={12} />
            </button>
          )}
        </div>
      </div>

      <PublishModal
        open={showPublish}
        onClose={() => setShowPublish(false)}
        clip={clip}
        jobId={jobId}
        onPublished={() => navigate("/uploads")}
      />
      <DownloadModal
        open={showDownload}
        onClose={() => setShowDownload(false)}
        clip={clip}
      />
    </div>
  );
}
