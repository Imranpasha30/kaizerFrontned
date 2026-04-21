import React, { useEffect, useState } from "react";
import {
  BarChart3, Loader2, AlertCircle, RefreshCw, ExternalLink,
  TrendingUp, Eye, ThumbsUp, MessageSquare,
} from "lucide-react";
import { api } from "../api/client";

export default function Performance() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [calibration, setCalibration] = useState(null);
  const [channels, setChannels] = useState([]);
  const [channelId, setChannelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const [lb, cal, chs] = await Promise.all([
        api.getLeaderboard(50),
        api.getCalibration(),
        api.listChannels(),
      ]);
      setLeaderboard(lb || []);
      setCalibration(cal);
      setChannels(chs || []);
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load performance data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handlePoll() {
    try {
      setPolling(true);
      await api.triggerPoll();
      setNotice("Stats poll triggered — refresh in a minute.");
    } catch (e) {
      setError(e.message);
    } finally {
      setPolling(false);
    }
  }

  const filtered = channelId
    ? leaderboard.filter((r) => r.channel_id === Number(channelId))
    : leaderboard;

  const channelName = (id) => channels.find((c) => c.id === id)?.name || `#${id}`;

  const maxBucketViews = calibration
    ? Math.max(...calibration.by_bucket.map((b) => b.mean_views || 0), 1)
    : 1;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="text-accent2" size={22} />
          <h1 className="text-xl font-semibold text-white">Performance</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="bg-black border border-border rounded px-2 py-1 text-sm text-white"
          >
            <option value="">All style profiles</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            onClick={handlePoll}
            disabled={polling}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent/80 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            {polling ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
            Poll Now
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {notice && (
        <div className="mb-3 p-2 bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading…</div>
      ) : (
        <>
          {/* Calibration histogram */}
          <section className="mb-6">
            <h2 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
              <TrendingUp size={14} /> SEO-Score Calibration
              <span className="text-xs text-gray-500">
                ({calibration?.total_samples || 0} samples)
              </span>
            </h2>
            {calibration?.total_samples > 0 ? (
              <div className="bg-[#111] border border-border rounded p-4">
                <div className="space-y-2">
                  {calibration.by_bucket.map((b) => (
                    <div key={b.bucket} className="flex items-center gap-3">
                      <div className="w-16 text-xs text-gray-400">{b.bucket}</div>
                      <div className="flex-1 h-5 bg-black rounded overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-accent to-accent2"
                          style={{ width: `${((b.mean_views || 0) / maxBucketViews) * 100}%` }}
                        />
                      </div>
                      <div className="w-24 text-right text-xs text-gray-300">
                        {b.n > 0 ? `${b.mean_views.toLocaleString()} avg` : "—"}
                      </div>
                      <div className="w-12 text-right text-xs text-gray-500">n={b.n}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Mean views per SEO-score bucket. A healthy pattern: higher score → higher views.
                </p>
              </div>
            ) : (
              <div className="bg-[#111] border border-border rounded p-4 text-sm text-gray-500 text-center">
                No samples yet — wait for the hourly analytics poller, or click "Poll Now" after your first uploads go live.
              </div>
            )}
          </section>

          {/* Leaderboard */}
          <section>
            <h2 className="text-sm font-medium text-gray-300 mb-2">Top Performing Clips</h2>
            {filtered.length === 0 ? (
              <div className="bg-[#111] border border-border rounded p-4 text-sm text-gray-500 text-center">
                No data yet.
              </div>
            ) : (
              <div className="bg-[#111] border border-border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-black/50 text-gray-400 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-3 py-2">Title</th>
                      <th className="text-left px-3 py-2">Style Profile</th>
                      <th className="text-right px-3 py-2"><Eye size={12} className="inline" /></th>
                      <th className="text-right px-3 py-2"><ThumbsUp size={12} className="inline" /></th>
                      <th className="text-right px-3 py-2"><MessageSquare size={12} className="inline" /></th>
                      <th className="text-right px-3 py-2">Score</th>
                      <th className="text-right px-3 py-2">Age</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((r) => (
                      <tr key={r.upload_job_id} className="hover:bg-white/5">
                        <td className="px-3 py-2 text-gray-200 max-w-md truncate">{r.title || "—"}</td>
                        <td className="px-3 py-2 text-gray-400">{channelName(r.channel_id)}</td>
                        <td className="px-3 py-2 text-right text-white font-medium">{r.views.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-gray-300">{r.likes.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-gray-300">{r.comments.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">
                          <ScoreBadge score={r.seo_score} />
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500 text-xs">{r.hours_since_publish}h</td>
                        <td className="px-3 py-2">
                          {r.video_url && (
                            <a
                              href={r.video_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-accent2 hover:text-accent"
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ScoreBadge({ score }) {
  const color =
    score >= 85 ? "bg-green-500/20 text-green-300" :
    score >= 70 ? "bg-yellow-500/20 text-yellow-300" :
    "bg-red-500/20 text-red-300";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${color}`}>{score || 0}</span>
  );
}
