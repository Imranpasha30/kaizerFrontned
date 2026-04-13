import React from "react";
import { Link } from "react-router-dom";
import { Edit2, Film, Download } from "lucide-react";
import { api } from "../api/client";

export default function ClipCard({ clip, jobId, index }) {
  const thumbUrl = clip.thumb_url ? api.mediaUrl(clip.thumb_url) + "&t=" + Date.now() : "";
  const videoUrl = clip.video_url ? api.mediaUrl(clip.video_url) : "";

  return (
    <div className="card overflow-hidden group hover:border-gray-600 transition-colors">
      {/* Thumbnail */}
      <div className="relative bg-black" style={{ aspectRatio: "9/16" }}>
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={`Clip ${index + 1}`}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600">
            <Film size={32} />
          </div>
        )}
        <div className="absolute top-1.5 left-1.5 bg-black/70 text-xs px-1.5 py-0.5 rounded text-gray-300">
          #{index + 1}
        </div>
        <div className="absolute top-1.5 right-1.5 bg-accent/80 text-xs px-1.5 py-0.5 rounded text-white capitalize">
          {clip.frame_type?.replace("_", " ")}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-2">
        <p className="text-xs text-gray-300 line-clamp-2 leading-relaxed min-h-[2.5rem]">
          {clip.text || <span className="text-gray-600">No text</span>}
        </p>
        <div className="flex gap-1.5">
          <Link
            to={`/jobs/${jobId}/edit/${clip.id}`}
            className="btn btn-secondary flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5"
          >
            <Edit2 size={12} /> Edit
          </Link>
          {videoUrl && (
            <a
              href={videoUrl}
              download={clip.filename || `clip_${index + 1}.mp4`}
              className="btn btn-secondary flex items-center justify-center gap-1 text-xs py-1.5 px-2"
              title="Download clip"
            >
              <Download size={12} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
