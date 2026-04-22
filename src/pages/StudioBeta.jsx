import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles, Film, Loader2, ChevronRight, Video,
} from "lucide-react";
import { api, editorApi } from "../api/client";

/**
 * Studio Beta — top-level landing for the pro editor beta mode.
 *
 * Shows the 5 style packs as gradient cards at the top, then lists the
 * user's recent jobs. Each clip card in a job exposes an "Open in Beta"
 * link that routes to /jobs/:jobId/editor-beta/:clipId where the full
 * beta editor (synced players, render button, effect chips) lives.
 */
export default function StudioBeta() {
  const [styles, setStyles] = useState([]);
  const [jobs, setJobs]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([
      editorApi.listStyles().catch(() => []),
      api.listJobs().catch(() => []),
    ])
      .then(([s, j]) => {
        setStyles(Array.isArray(s) ? s : []);
        setJobs(Array.isArray(j) ? j : []);
      })
      .catch((e) => setErr(e.message || String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-600">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  // Only jobs that finished have clips ready to edit.
  const renderableJobs = jobs.filter(
    (j) => j.status === "done" && Array.isArray(j.clips) && j.clips.length > 0
  );

  return (
    <div className="max-w-6xl xl:max-w-7xl 2xl:max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-accent2 flex items-center justify-center">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Studio Beta
              <span className="beta-badge">NEW</span>
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Pro editor mode — apply animated effects, transitions, and colour grades to any clip.
            </p>
          </div>
        </div>
      </div>

      {err && (
        <div className="mb-4 p-3 rounded bg-red-900/40 border border-red-700/40 text-sm text-red-300">
          Couldn't load some data: {err}
        </div>
      )}

      {/* Style pack preview */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Style packs
        </h2>
        {styles.length === 0 ? (
          <p className="text-sm text-gray-600">No style packs available — is the backend running?</p>
        ) : (
          <div className="style-pack-row">
            {styles.map((pack) => (
              <div
                key={pack.name}
                data-pack={pack.name}
                className="style-pack-card"
                style={{ cursor: "default", width: 200, height: 240 }}
                title={pack.description}
              >
                <div>
                  <div className="text-[11px] uppercase tracking-widest opacity-80 mb-1">
                    {pack.transition} · {pack.color_preset}
                  </div>
                  <div className="text-lg font-bold">{pack.label}</div>
                </div>
                <div className="text-[12px] opacity-90 leading-snug">
                  {pack.description}
                </div>
                <div className="flex flex-wrap gap-1">
                  {pack.motion && <span className="effect-chip">{pack.motion}</span>}
                  <span className="effect-chip">{pack.text_animation}</span>
                  <span className="effect-chip">{pack.caption_animation}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pick a clip */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Film size={14} /> Pick a clip to beta-edit
        </h2>

        {renderableJobs.length === 0 ? (
          <div className="card p-10 text-center">
            <Video size={32} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm mb-1">No rendered clips yet.</p>
            <p className="text-gray-600 text-xs mb-4">
              Run a job and come back — every clip shows up here as a card.
            </p>
            <Link to="/new" className="btn btn-primary inline-flex items-center gap-2">
              Create a job
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {renderableJobs.map((job) => (
              <JobClips key={job.id} job={job} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function JobClips({ job }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-gray-200">
            {job.video_name || `Job #${job.id}`}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {job.platform} · {job.clips?.length ?? 0} clips · {job.status}
          </div>
        </div>
        <Link
          to={`/jobs/${job.id}`}
          className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
        >
          View job <ChevronRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {job.clips.map((clip) => {
          const thumb = clip.thumb_path
            ? `/media/${clip.thumb_path.replace(/^.*?output[\\/]/, "")}`
            : null;
          return (
            <Link
              key={clip.id}
              to={`/jobs/${job.id}/editor-beta/${clip.id}`}
              className="block rounded-lg overflow-hidden bg-black/40 border border-border hover:border-accent transition-colors group"
            >
              <div className="aspect-[9/16] bg-black relative">
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition"
                    onError={(e) => {
                      e.target.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film size={24} className="text-gray-700" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
                  <div className="text-[11px] text-white font-medium">
                    Clip {clip.clip_index + 1}
                  </div>
                </div>
              </div>
              <div className="p-2 text-center">
                <span className="inline-flex items-center gap-1 text-[11px] text-accent2 font-semibold">
                  <Sparkles size={11} /> Open in Beta
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
