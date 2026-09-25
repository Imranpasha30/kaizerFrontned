import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart, Loader2, AlertCircle, RefreshCw, ExternalLink,
  TrendingUp, Eye, ThumbsUp, MessageSquare, Youtube, Award, Activity,
  Search, Download, ArrowUpDown, Calendar, X, Layers, Zap, Trophy,
  Flame, BarChart3, ChevronRight, SlidersHorizontal, Clock, Swords, Stethoscope,
} from "lucide-react";
import { api } from "../api/client";
import {
  LineChart as RLineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  AiCoachPanel, CompareChannelsPanel, MetricHelp, METRIC_HELP, cadenceLabel,
  RadialGauge, KpiRing, fmtN as fmtNAI,
} from "../components/AnalyticsAI";
import ComplianceNote, { NoteLink } from "../components/ComplianceNote";
import TrendFinderTab from "../components/TrendFinderTab";
import StyleReferencesPanel from "../components/StyleReferencesPanel";

export default function Performance() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [calibration, setCalibration] = useState(null);
  // Summary cards driven by real YouTube channels (one entry per
  // OAuthToken.google_channel_id) — NOT per style profile.
  const [ytChannels, setYtChannels] = useState([]);
  // Selected YT channel filter. Empty = all. When set we use the
  // first style-profile id that routes to this YT channel for the
  // backend's existing channel_id filter (which keys on style profile).
  const [selectedGcid, setSelectedGcid] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(false);
  const [notice, setNotice] = useState("");

  // Phase 2 — full-channel video catalogue
  const [catalogVideos,   setCatalogVideos]   = useState([]);
  const [catalogTotal,    setCatalogTotal]    = useState(0);
  const [catalogQuery,    setCatalogQuery]    = useState("");
  const [catalogOrderBy,  setCatalogOrderBy]  = useState("views");
  const [catalogLoading,  setCatalogLoading]  = useState(false);
  const [syncing,         setSyncing]         = useState(false);
  const [lastSyncResult,  setLastSyncResult]  = useState(null);
  // "Sync All" — sequential catalogue sync across every connected channel.
  const [syncingAll,      setSyncingAll]      = useState(false);
  const [syncAllMsg,      setSyncAllMsg]      = useState("");
  // Hide the expert charts (SEO-score calibration, cross-channel compare,
  // percentile ranks) behind a toggle so normal users aren't overwhelmed.
  const [showAdvanced,    setShowAdvanced]    = useState(false);
  // Insights sub-tab: "performance" (the stats view) | "learning" (per-channel
  // SEO feedback-loop learning — what the system learnt from past results).
  const [tab,             setTab]             = useState("performance");

  // Phase 3 — single-video comparison
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [videoCompare,    setVideoCompare]    = useState(null);
  const [comparingVideo,  setComparingVideo]  = useState(false);
  // Feature 3 — same video ranked across every connected channel.
  const [acrossChannels,  setAcrossChannels]  = useState(null);

  // Phase 4 — cross-channel comparison
  const [channelCompare,  setChannelCompare]  = useState([]);

  // Resolve the picked YT channel → which style-profile id to filter by.
  // The backend's existing /leaderboard?channel_id= and /calibration?channel_id=
  // keys on style-profile (Channel) id; this maps the user's real-channel
  // selection back to that id without changing those endpoints.
  const filterProfileId = useMemo(() => {
    if (!selectedGcid) return null;
    const yt = ytChannels.find((c) => c.google_channel_id === selectedGcid);
    return yt?.style_profile_ids?.[0] || null;
  }, [selectedGcid, ytChannels]);

  async function load() {
    const scope = filterProfileId ? Number(filterProfileId) : null;
    try {
      const [lb, cal, yts] = await Promise.all([
        api.getLeaderboard(50, scope),
        api.getCalibration(scope),
        api.getPerfChannels(),
      ]);
      setLeaderboard(lb || []);
      setCalibration(cal);
      setYtChannels(yts || []);
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load performance data");
    } finally {
      setLoading(false);
    }
  }

  // Re-fetch whenever the filter flips so the calibration histogram +
  // leaderboard track the dropdown.
  useEffect(() => { load(); }, [selectedGcid]);

  // Cross-channel comparison rollup. Refreshed when channel-summary
  // cards change (e.g. after a sync) — uses ytChannels.length as a
  // coarse signal so we don't have to thread refresh handlers.
  useEffect(() => {
    let alive = true;
    api.compareChannels()
      .then((rows) => { if (alive) setChannelCompare(rows || []); })
      .catch(() => { if (alive) setChannelCompare([]); });
    return () => { alive = false; };
  }, [ytChannels.length, lastSyncResult]);

  // Catalogue loader: pulls the video list for the selected YT channel.
  // Debounced via the catalogQuery / catalogOrderBy deps so a typing
  // user doesn't trigger 6 round-trips per keystroke.
  useEffect(() => {
    if (!selectedGcid) {
      setCatalogVideos([]); setCatalogTotal(0);
      return;
    }
    let alive = true;
    setCatalogLoading(true);
    const t = setTimeout(() => {
      api.listChannelVideos(selectedGcid, {
        limit: 60, q: catalogQuery, orderBy: catalogOrderBy,
      })
        .then((res) => {
          if (!alive) return;
          setCatalogVideos(res?.videos || []);
          setCatalogTotal(res?.total || 0);
        })
        .catch((e) => {
          if (!alive) return;
          setCatalogVideos([]); setCatalogTotal(0);
          // Catalogue might just be empty (never synced) — don't treat
          // that as a top-level error banner. The empty state UI handles it.
          console.warn("listChannelVideos:", e);
        })
        .finally(() => { if (alive) setCatalogLoading(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [selectedGcid, catalogQuery, catalogOrderBy, lastSyncResult]);

  // Clear video selection when channel changes — comparing a video
  // from the wrong channel makes no sense.
  useEffect(() => { setSelectedVideoId(""); setVideoCompare(null); }, [selectedGcid]);

  // Video comparison: fetch ranks + peers when the user clicks a card
  // in the explorer.  Two parallel calls — within-channel ranks + peer
  // videos (compareVideo) and across-channels ranks (Feature 3) — so
  // the user sees both at once without an extra click.
  useEffect(() => {
    if (!selectedVideoId) {
      setVideoCompare(null);
      setAcrossChannels(null);
      return;
    }
    let alive = true;
    setComparingVideo(true);
    Promise.all([
      api.compareVideo(selectedVideoId).catch((e) => {
        console.warn("compareVideo:", e);
        return null;
      }),
      api.compareVideoAcrossChannels(selectedVideoId).catch((e) => {
        console.warn("compareVideoAcrossChannels:", e);
        return null;
      }),
    ])
      .then(([cmp, across]) => {
        if (!alive) return;
        setVideoCompare(cmp);
        setAcrossChannels(across);
        if (!cmp && !across) {
          setError("Compare failed — sync the channel first.");
        }
      })
      .finally(() => { if (alive) setComparingVideo(false); });
    return () => { alive = false; };
  }, [selectedVideoId]);

  async function handleSync() {
    if (!selectedGcid) return;
    setSyncing(true); setError(""); setNotice("");
    try {
      const res = await api.syncChannelVideos(selectedGcid, 200);
      setLastSyncResult(res);
      const who = selectedYt?.youtube_channel_title || "channel";
      setNotice(
        `Synced ${who} — ${res.synced} videos cached `
        + `(${res.new} new, ${res.updated} updated).`
      );
      setTimeout(() => setNotice(""), 5000);
    } catch (e) {
      setError(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  // Universal "Sync All": pull the full video catalogue for EVERY
  // connected channel, one at a time. Sequential (not parallel) so we
  // pace YouTube Data API quota and the cards fill in progressively.
  async function handleSyncAll() {
    const chans = ytChannels.filter((c) => c.google_channel_id);
    if (!chans.length || syncingAll) return;
    setSyncingAll(true); setError(""); setNotice("");
    let ok = 0, failed = 0, totalVideos = 0;
    for (let i = 0; i < chans.length; i++) {
      const c = chans[i];
      const who = c.youtube_channel_title || c.google_channel_id;
      setSyncAllMsg(`Syncing ${i + 1}/${chans.length} — ${who}…`);
      try {
        const res = await api.syncChannelVideos(c.google_channel_id, 200);
        ok += 1;
        totalVideos += (res?.synced || 0);
        setLastSyncResult(res);
        // Refresh just the cards so this channel fills in live.
        try { setYtChannels((await api.getPerfChannels()) || []); } catch { /* keep going */ }
      } catch {
        failed += 1;
      }
    }
    setSyncAllMsg("");
    setSyncingAll(false);
    try { await load(); } catch { /* surfaced in load() */ }
    setNotice(
      `Sync All complete — ${ok}/${chans.length} channels synced `
      + `(${totalVideos} videos cached)`
      + (failed ? `, ${failed} failed.` : ".")
    );
    setTimeout(() => setNotice(""), 8000);
  }

  async function handlePoll() {
    try {
      setPolling(true);
      setError("");
      // Same scope as the filter — empty = poll everything across
      // every connected channel; specific = poll only that channel's
      // uploads (saves YouTube Data API quota).
      const scope = filterProfileId ? Number(filterProfileId) : null;
      await api.triggerPoll(scope);
      const who = selectedGcid
        ? (ytChannels.find((c) => c.google_channel_id === selectedGcid)?.youtube_channel_title || "selected channel")
        : "all channels";
      setNotice(`Stats poll triggered for ${who} — fetching fresh data…`);
      // Backend poll is async and hits YouTube for every recent upload — can
      // take 15–60 s depending on how many uploads are in flight.  Pull fresh
      // data a few times so late-arriving stats flow in without a manual reload.
      let ticks = 0;
      const maxTicks = 8;          // ~40 s total
      const intervalMs = 5000;
      const timer = setInterval(async () => {
        ticks += 1;
        try {
          await load();
        } catch { /* surfaced inside load() */ }
        if (ticks >= maxTicks) {
          clearInterval(timer);
          setNotice("Poll complete — showing latest stats.");
          // Clear the notice after a moment so it doesn't linger forever.
          setTimeout(() => setNotice(""), 4000);
        }
      }, intervalMs);
      // Do one immediate refresh too, so the "n=0" skeleton doesn't sit there
      // for 5 full seconds if the poll was fast.
      setTimeout(() => load().catch(() => {}), 800);
    } catch (e) {
      setError(e.message);
    } finally {
      setPolling(false);
    }
  }

  // Leaderboard now arrives pre-filtered from the backend (we pass
  // filterProfileId to /performance/leaderboard) so no client filter.
  const selectedYt = useMemo(
    () => ytChannels.find((c) => c.google_channel_id === selectedGcid) || null,
    [ytChannels, selectedGcid]
  );

  // "Top Channels" lane — every channel with at least one view, ranked
  // by total views (most-watched first).
  const topChannels = useMemo(
    () => [...ytChannels]
      .filter((c) => (c.total_views || 0) > 0)
      .sort((a, b) => (b.total_views || 0) - (a.total_views || 0)),
    [ytChannels]
  );

  // Headline KPIs for the circular-gauge overview strip.
  const overview = useMemo(() => {
    const withData = ytChannels.filter((c) => (c.video_count || 0) > 0);
    const active = ytChannels.filter((c) => (c.total_views || 0) > 0);
    const totalViews = ytChannels.reduce((s, c) => s + (c.total_views || 0), 0);
    const totalVideos = ytChannels.reduce((s, c) => s + (c.total_videos || 0), 0);
    const engRates = active.map((c) => c.engagement_rate || 0);
    const avgEng = engRates.length
      ? engRates.reduce((s, v) => s + v, 0) / engRates.length : 0;
    const paces = active.map((c) => c.cadence_per_week || 0);
    const avgPace = paces.length ? paces.reduce((s, v) => s + v, 0) / paces.length : 0;
    return {
      totalViews, totalVideos,
      total: ytChannels.length,
      withData: withData.length,
      active: active.length,
      avgEng, avgPace,
      best: active[0] || null,
    };
  }, [ytChannels]);

  const maxBucketViews = calibration
    ? Math.max(...calibration.by_bucket.map((b) => b.mean_views || 0), 1)
    : 1;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LineChart className="text-accent2" size={22} />
          <h1 className="text-xl font-semibold text-white">Insights</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedGcid}
            onChange={(e) => setSelectedGcid(e.target.value)}
            className="bg-black border border-border rounded px-2 py-1 text-sm text-white"
          >
            <option value="">All channels</option>
            {ytChannels.map((c) => (
              <option key={c.google_channel_id} value={c.google_channel_id}>
                {c.youtube_channel_title || c.google_channel_id}
              </option>
            ))}
          </select>
          <button
            onClick={handleSyncAll}
            disabled={syncingAll || !ytChannels.length}
            title="Pull the full video catalogue for EVERY connected channel (one at a time). Heavier on YouTube quota than Poll."
            className="flex items-center gap-1.5 bg-accent2 hover:bg-accent2/80 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            {syncingAll ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
            {syncingAll ? "Syncing…" : "Sync All"}
          </button>
          <button
            onClick={handlePoll}
            disabled={polling}
            title={selectedYt
              ? `Refresh stats for ${selectedYt.youtube_channel_title} only — saves quota on other channels`
              : "Refresh stats for every connected channel"}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent/80 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            {polling ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
            {selectedYt ? `Poll ${selectedYt.youtube_channel_title}` : "Poll All"}
          </button>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            title="Show or hide the expert charts (SEO-score patterns, channel comparison)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm border ${
              showAdvanced
                ? "bg-accent2/15 border-accent2/40 text-accent2"
                : "bg-transparent border-border text-gray-400 hover:text-white"
            }`}
          >
            <SlidersHorizontal size={14} />
            {showAdvanced ? "Hide advanced" : "Advanced"}
          </button>
        </div>
      </header>

      <ComplianceNote className="mb-4">
        <p>
          Insights shows public stats (views, likes, comments) for your own connected channels, retrieved
          through YouTube API Services. These are public metrics, not private YouTube Analytics, and may differ
          from YouTube Studio. We do not sell, share, or train AI on this data.
        </p>
        <p>
          Disconnecting a channel stops access immediately. Subject to the{" "}
          <NoteLink href="https://www.youtube.com/t/terms">YouTube ToS</NoteLink> and{" "}
          <NoteLink href="https://policies.google.com/privacy">Google Privacy Policy</NoteLink>.
        </p>
      </ComplianceNote>

      {/* Insights sub-tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {[
          { k: "performance", label: "Performance", Icon: BarChart3 },
          { k: "learning", label: "SEO Settings", Icon: SlidersHorizontal },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === t.k
                ? "border-accent2 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <t.Icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {syncingAll && syncAllMsg && (
        <div className="mb-3 p-2 bg-accent2/10 border border-accent2/30 text-accent2 text-sm rounded flex items-center gap-2">
          <Loader2 className="animate-spin" size={14} /> {syncAllMsg}
          <span className="text-gray-500 text-xs">— keep this tab open until it finishes</span>
        </div>
      )}

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
      ) : tab === "learning" ? (
        <SeoLearningTab ytChannels={ytChannels} initialGcid={selectedGcid || ""} />
      ) : (
        <>
          {/* ── Overview hero: circular KPI gauges ─────────────────── */}
          <OverviewStrip overview={overview} />

          {/* ── AI Coach (kept on top) ─────────────────────────────── */}
          <AiCoachPanel
            ytChannels={ytChannels}
            initialGcid={selectedGcid || ""}
            hasData={topChannels.length > 0 || leaderboard.length > 0}
          />

          {/* ── Compare (kept on top) ──────────────────────────────── */}
          <CompareChannelsPanel ytChannels={ytChannels} />

          {/* ── Lane 1: Your Channels (horizontal scroll) ──────────── */}
          <Lane
            title="Your Channels"
            icon={Youtube}
            iconColor="text-red-500"
            count={ytChannels.length}
            hint="Tap a channel to see its videos below"
            empty={ytChannels.length === 0 ? "No channels connected yet." : null}
          >
            {ytChannels.map((c) => (
              <div key={c.google_channel_id} className="w-[260px] flex-shrink-0 snap-start">
                <ChannelCard
                  channel={c}
                  selected={selectedGcid === c.google_channel_id}
                  onClick={() =>
                    setSelectedGcid(
                      selectedGcid === c.google_channel_id ? "" : c.google_channel_id
                    )
                  }
                />
              </div>
            ))}
          </Lane>

          {/* ── Lane 2: Best Videos (horizontal scroll) ────────────── */}
          <Lane
            title="Best Videos"
            icon={Flame}
            iconColor="text-orange-400"
            subtitle={selectedYt ? selectedYt.youtube_channel_title : "across all your channels"}
            empty={leaderboard.length === 0
              ? "No videos yet — hit \"Sync All\" or \"Poll All\" above to pull your numbers."
              : null}
          >
            {leaderboard.map((r) => (
              <div key={r.upload_job_id} className="w-[280px] flex-shrink-0 snap-start">
                <PerfClipCard clip={r} />
              </div>
            ))}
          </Lane>

          {/* ── Lane 3: Top Channels (ranked by views) ─────────────── */}
          <Lane
            title="Top Channels"
            icon={Trophy}
            iconColor="text-yellow-400"
            subtitle="most watched first"
            empty={topChannels.length === 0
              ? "No views yet — your channels will rank here once videos get views."
              : null}
          >
            {topChannels.map((c, i) => (
              <RankCard
                key={c.google_channel_id}
                rank={i + 1}
                channel={c}
                selected={selectedGcid === c.google_channel_id}
                onClick={() =>
                  setSelectedGcid(
                    selectedGcid === c.google_channel_id ? "" : c.google_channel_id
                  )
                }
              />
            ))}
          </Lane>

          {/* ── Channel detail: videos for the tapped channel ──────── */}
          {selectedYt && (
            <div className="mt-1 rounded-lg border border-accent2/30 bg-accent2/[0.03] p-1">
              <VideoExplorerSection
                channel={selectedYt}
                videos={catalogVideos}
                total={catalogTotal}
                query={catalogQuery}
                setQuery={setCatalogQuery}
                orderBy={catalogOrderBy}
                setOrderBy={setCatalogOrderBy}
                loading={catalogLoading}
                syncing={syncing}
                onSync={handleSync}
                selectedVideoId={selectedVideoId}
                setSelectedVideoId={setSelectedVideoId}
                compare={videoCompare}
                acrossChannels={acrossChannels}
                comparing={comparingVideo}
              />
            </div>
          )}

          {/* ── Advanced (hidden by default) ───────────────────────── */}
          {showAdvanced && (
            <div className="mt-4 border-t border-border pt-5 space-y-6">
              <div className="text-[11px] uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                <SlidersHorizontal size={12} /> Advanced analytics
              </div>

              {channelCompare.length >= 2 && (
                <ChannelCompareSection rows={channelCompare} />
              )}

              {/* SEO-score calibration histogram (expert chart) */}
              <section>
                <h2 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                  <TrendingUp size={14} /> SEO-Score vs Views
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
                      Average views per SEO-score band. A healthy pattern: higher score → more views.
                    </p>
                  </div>
                ) : (
                  <div className="bg-[#111] border border-border rounded p-4 text-sm text-gray-500 text-center">
                    No samples yet — wait for the hourly poller, or click "Poll All" after your uploads go live.
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Circular-gauge KPI tile for the overview hero.
function GaugeCard({ label, help, value, max, color, display, sublabel }) {
  return (
    <div className="rounded-xl border border-border bg-[#0e1218] p-3 flex items-center gap-3">
      <RadialGauge value={value} max={max} color={color} display={display} sublabel={sublabel} size={70} />
      <div className="min-w-0">
        <div className="text-[11px] text-gray-400 flex items-center gap-1 leading-snug">
          {label} {help && <MetricHelp text={help} />}
        </div>
      </div>
    </div>
  );
}

// Dashboard hero: total reach + circular gauges at a glance.
function OverviewStrip({ overview: o }) {
  if (!o || o.total === 0) return null;
  return (
    <section className="mb-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-cyan-800/30 bg-gradient-to-br from-cyan-950/40 to-[#0e1218] p-4 flex flex-col justify-between">
          <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
            <Eye size={12} className="text-cyan-400" /> Total reach
          </div>
          <div className="text-3xl font-black text-white mt-1 leading-none">{fmtNAI(o.totalViews)}</div>
          <div className="text-[10px] text-gray-500 mt-1">
            {fmtNAI(o.totalVideos)} videos · {o.total} channels
          </div>
        </div>
        <GaugeCard
          label="Channels with views"
          help="How many of your connected channels actually have views yet."
          value={o.active} max={Math.max(o.total, 1)} color="#a78bfa"
          display={`${o.active}/${o.total}`}
        />
        <GaugeCard
          label="Avg interaction"
          help={METRIC_HELP.interaction}
          value={o.avgEng} max={10} color="#34d399"
          display={`${o.avgEng.toFixed(1)}%`}
        />
        <GaugeCard
          label="Avg posting"
          help={METRIC_HELP.uploads_week}
          value={o.avgPace} max={7} color="#fbbf24"
          display={o.avgPace.toFixed(1)} sublabel="/wk"
        />
      </div>
    </section>
  );
}

// A horizontally-scrolling section ("lane"). The row scrolls on its own
// (overflow-x-auto) so the page itself stays short — the user scrolls a
// section, not the whole page.
function Lane({ title, icon: Icon, iconColor = "text-accent2", count, subtitle, hint, empty, children }) {
  return (
    <section className="mb-5">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          {Icon && <Icon size={15} className={iconColor} />}
          {title}
        </h2>
        {count != null && <span className="text-xs text-gray-500">· {count}</span>}
        {subtitle && <span className="text-xs text-gray-500">· {subtitle}</span>}
        {hint && <span className="ml-auto text-[10px] text-gray-600">{hint}</span>}
      </div>
      {empty != null ? (
        <div className="bg-[#111] border border-border rounded-lg p-5 text-sm text-gray-500 text-center">
          {empty}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2.5 px-0.5 snap-x scroll-smooth">
          {children}
        </div>
      )}
    </section>
  );
}

// Compact ranked channel card for the "Top Channels" lane.
function RankCard({ rank, channel, selected, onClick }) {
  const c = channel;
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${c.youtube_channel_title} — ${fmtNum(c.total_views)} views`}
      className={`w-[210px] flex-shrink-0 snap-start text-left bg-[#111] border rounded-lg p-3 transition-all hover:border-accent2 ${
        selected ? "border-accent2 ring-1 ring-accent2/40" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="w-7 text-center text-base font-bold text-gray-300">
          {medal || `#${rank}`}
        </span>
        {c.channel_thumbnail_url ? (
          <img
            src={c.channel_thumbnail_url}
            alt=""
            className="w-8 h-8 rounded-full bg-black/40 object-cover flex-shrink-0"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-red-900/40 flex items-center justify-center text-xs text-white flex-shrink-0">
            {(c.youtube_channel_title || "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white truncate">{c.youtube_channel_title}</div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1">
            <Eye size={10} /> {fmtNum(c.total_views)} views
          </div>
        </div>
      </div>
    </button>
  );
}

function ChannelCard({ channel, selected, onClick }) {
  const c = channel;
  const eng = c.engagement_rate || 0;
  // A channel with zero uploads on YouTube has nothing to sync — show a
  // distinct "no videos yet" state instead of the "Sync me" prompt.
  const ytEmpty = (c.video_count || 0) === 0;
  const needsSync = !ytEmpty && (c.needs_sync || (c.total_videos || 0) === 0);
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        needsSync
          ? `Click to focus this channel — then hit "Sync from YouTube" in the explorer below.`
          : selected
            ? "Click to clear filter"
            : `Filter histogram + leaderboard to ${c.youtube_channel_title}`
      }
      className={`text-left bg-[#111] border rounded-lg p-3 transition-all hover:border-accent2 ${
        selected ? "border-accent2 ring-1 ring-accent2/40" : "border-border"
      } ${needsSync ? "opacity-90" : ""}`}
    >
      <div className="flex items-center gap-2 mb-2">
        {c.channel_thumbnail_url ? (
          <img
            src={c.channel_thumbnail_url}
            alt={c.youtube_channel_title}
            className="w-9 h-9 rounded-full bg-black/40 object-cover flex-shrink-0"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-red-900/40 flex items-center justify-center flex-shrink-0">
            <Youtube size={16} className="text-red-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white truncate">
            {c.youtube_channel_title || "(no name)"}
          </div>
          <div className="text-[10px] text-gray-500">
            {(c.subscriber_count || 0).toLocaleString()} subs · {(c.video_count || 0).toLocaleString()} videos on YT
          </div>
        </div>
      </div>

      {ytEmpty ? (
        <div className="border border-dashed border-border bg-black/30 rounded p-3 text-center">
          <div className="text-xs text-gray-400 font-medium mb-1">
            No videos uploaded yet
          </div>
          <div className="text-[10px] text-gray-500 leading-relaxed">
            This YouTube channel has no public videos to sync. Stats will
            appear here once it has uploads.
          </div>
        </div>
      ) : needsSync ? (
        <div className="border border-dashed border-accent2/50 bg-accent2/10 rounded p-3 text-center">
          <div className="text-xs text-accent2 font-medium mb-1">
            Not synced yet
          </div>
          <div className="text-[10px] text-gray-400 leading-relaxed">
            Tap this card, then hit <span className="text-accent2 font-medium">Sync from YouTube</span> —
            or use <span className="text-accent2 font-medium">Sync All</span> up top to pull
            every channel at once.
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            <Stat icon={Eye}            label="views"    value={c.total_views} />
            <Stat icon={ThumbsUp}       label="likes"    value={c.total_likes} />
            <Stat icon={MessageSquare}  label="comments" value={c.total_comments} />
          </div>

          <div className="flex items-center justify-between text-[10px] text-gray-500 mb-2">
            <span className="flex items-center gap-1" title="Likes + comments per view">
              <Activity size={10} className="text-accent2" />
              {eng.toFixed(1)}% interaction
            </span>
            <span>{c.total_videos} videos</span>
            {(c.avg_seo_score || 0) > 0 && (
              <ScoreBadge score={Math.round(c.avg_seo_score || 0)} />
            )}
          </div>

          {c.top_clip && (
            <div className="border-t border-border/60 pt-2 flex items-center gap-2">
              {c.top_clip.thumb_url ? (
                <img
                  src={c.top_clip.thumb_url}
                  alt=""
                  className="w-14 h-10 object-cover rounded bg-black/40 flex-shrink-0"
                  loading="lazy"
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              ) : (
                <div className="w-14 h-10 bg-black/40 rounded flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Top video on channel</div>
                <div className="text-xs text-gray-200 line-clamp-2" title={c.top_clip.title}>
                  {c.top_clip.title || "—"}
                </div>
                <div className="text-[10px] text-accent2">
                  {(c.top_clip.views || 0).toLocaleString()} views
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </button>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="bg-black/40 rounded px-2 py-1 flex flex-col">
      <div className="flex items-center gap-1 text-[10px] text-gray-500">
        <Icon size={9} /> {label}
      </div>
      <div className="text-sm text-white font-semibold tabular-nums">
        {fmtNum(value || 0)}
      </div>
    </div>
  );
}

function fmtNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function PerfClipCard({ clip: r }) {
  return (
    <div className="bg-[#111] border border-border rounded-lg overflow-hidden hover:border-accent2 transition-colors flex flex-col">
      <div className="relative bg-black" style={{ aspectRatio: "9/16" }}>
        {r.thumb_url ? (
          <img
            src={r.thumb_url}
            alt={r.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700">
            <Youtube size={28} />
          </div>
        )}
        <div className="absolute top-1.5 left-1.5">
          <ScoreBadge score={r.seo_score} />
        </div>
        {r.video_url && (
          <a
            href={r.video_url}
            target="_blank"
            rel="noreferrer"
            className="absolute top-1.5 right-1.5 bg-black/70 hover:bg-accent text-white p-1 rounded"
            title="Open on YouTube"
          >
            <ExternalLink size={11} />
          </a>
        )}
      </div>

      <div className="p-2.5 flex flex-col gap-1.5 flex-1">
        <div className="text-xs text-gray-200 line-clamp-2 leading-snug min-h-[2.5rem]"
             title={r.title}>
          {r.title || "—"}
        </div>
        <div className="text-[10px] text-gray-500 flex items-center gap-1 truncate">
          <Youtube size={10} className="text-red-400 flex-shrink-0" />
          <span className="truncate">{r.youtube_channel_title || r.style_profile_name || `#${r.channel_id}`}</span>
        </div>

        <div className="grid grid-cols-3 gap-1 mt-1">
          <CompactStat icon={Eye}           value={r.views} />
          <CompactStat icon={ThumbsUp}      value={r.likes} />
          <CompactStat icon={MessageSquare} value={r.comments} />
        </div>

        <div className="flex items-center justify-between text-[10px] text-gray-500 mt-1">
          <span className="flex items-center gap-1">
            <Activity size={9} className="text-accent2" />
            {(r.engagement_rate || 0).toFixed(2)}%
          </span>
          <span>{r.hours_since_publish}h ago</span>
        </div>
      </div>
    </div>
  );
}

function CompactStat({ icon: Icon, value }) {
  return (
    <div className="bg-black/40 rounded px-1.5 py-1 flex items-center gap-1 min-w-0">
      <Icon size={9} className="text-gray-500 flex-shrink-0" />
      <span className="text-[11px] text-gray-200 tabular-nums truncate">
        {fmtNum(value || 0)}
      </span>
    </div>
  );
}

// ─── Phase 4 components ───────────────────────────────────────────

function ChannelCompareSection({ rows }) {
  // Normalise each bar's width against the global max for that metric
  // so the visual comparison stays apples-to-apples.
  const max = useMemo(() => ({
    views:    Math.max(...rows.map((r) => r.total_views || 0), 1),
    cadence:  Math.max(...rows.map((r) => r.cadence_per_week || 0), 0.01),
    engage:   Math.max(...rows.map((r) => r.engagement_rate || 0), 0.01),
    median:   Math.max(...rows.map((r) => r.median_views || 0), 1),
  }), [rows]);

  return (
    <section className="mb-6">
      <h2 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
        <Trophy size={14} className="text-accent2" /> Channel Comparison
        <span className="text-xs text-gray-500">
          ({rows.length} channels with synced history)
        </span>
      </h2>
      <div className="bg-[#111] border border-border rounded p-4 space-y-3">
        {rows.map((r) => (
          <div key={r.google_channel_id} className="border-b border-border/40 pb-3 last:border-b-0 last:pb-0">
            <div className="flex items-center gap-2 mb-2">
              {r.channel_thumbnail_url ? (
                <img src={r.channel_thumbnail_url}
                     alt={r.youtube_channel_title}
                     className="w-7 h-7 rounded-full bg-black/40 object-cover flex-shrink-0"
                     onError={(e) => { e.target.style.display = "none"; }} />
              ) : (
                <Youtube size={16} className="text-red-400 flex-shrink-0" />
              )}
              <div className="text-sm font-semibold text-white truncate flex-1">
                {r.youtube_channel_title || r.google_channel_id}
              </div>
              <div className="text-[10px] text-gray-500">
                {r.total_videos} videos · {(r.subscriber_count || 0).toLocaleString()} subs
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1">
              <CmpRing label="Views" help={METRIC_HELP.views}
                       value={r.total_views} max={max.views} color="#22d3ee"
                       display={fmtNum(r.total_views)} />
              <CmpRing label="Typical" help={METRIC_HELP.typical}
                       value={r.median_views} max={max.median} color="#a78bfa"
                       display={fmtNum(r.median_views)} />
              <CmpRing label="Interaction" help={METRIC_HELP.interaction}
                       value={r.engagement_rate} max={max.engage} color="#34d399"
                       display={`${(r.engagement_rate || 0).toFixed(1)}`} sublabel="/100" />
              <CmpRing label="Posting" help={METRIC_HELP.uploads_week}
                       value={r.cadence_per_week} max={max.cadence} color="#fbbf24"
                       display={(r.cadence_per_week || 0).toFixed(1)} sublabel="/wk" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Circular version of a comparison metric — the arc fills relative to
// the best channel for that metric (apples-to-apples across rows).
function CmpRing({ label, help, value, max, color, display, sublabel }) {
  return (
    <div className="flex flex-col items-center gap-1 py-1">
      <RadialGauge value={value} max={max} color={color} display={display}
                   sublabel={sublabel} size={58} stroke={5} />
      <span className="text-[9px] text-gray-500 flex items-center gap-0.5 text-center leading-tight">
        {label}{help && <MetricHelp text={help} />}
      </span>
    </div>
  );
}

function CmpBar({ label, help, value, max, fmt }) {
  const pct = max ? Math.min(100, Math.round((value || 0) / max * 100)) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-28 text-gray-500 flex-shrink-0 flex items-center gap-1">
        {label} {help && <MetricHelp text={help} />}
      </div>
      <div className="flex-1 h-3 bg-black rounded overflow-hidden">
        <div className="h-full bg-gradient-to-r from-accent2 to-accent transition-all"
             style={{ width: `${pct}%` }} />
      </div>
      <div className="w-28 text-right text-gray-200 tabular-nums text-[11px]">
        {fmt ? fmt(value) : value}
      </div>
    </div>
  );
}

// ─── Phase 2 + 3 components ───────────────────────────────────────

function VideoExplorerSection({
  channel, videos, total, query, setQuery, orderBy, setOrderBy,
  loading, syncing, onSync, selectedVideoId, setSelectedVideoId,
  compare, acrossChannels, comparing,
}) {
  return (
    <section className="mb-6">
      <h2 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
        <Layers size={14} className="text-accent2" /> Channel Video Explorer
        <span className="text-xs text-gray-500">· {channel.youtube_channel_title}</span>
        {total > 0 && (
          <span className="text-xs text-gray-500">({total} cached)</span>
        )}
      </h2>

      <div className="bg-[#111] border border-border rounded p-3">
        {/* Toolbar: sync + search + sort */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            title="Pull this channel's complete upload list from YouTube Data API and cache locally."
            className="bg-accent hover:bg-accent/80 text-white text-xs px-3 py-1.5 rounded flex items-center gap-1.5 disabled:opacity-50"
          >
            {syncing
              ? <><Loader2 size={12} className="animate-spin" /> Syncing…</>
              : <><Download size={12} /> Sync from YouTube</>}
          </button>
          <div className="relative flex-1 min-w-[160px]">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search this channel's videos…"
              className="w-full bg-black border border-border rounded pl-7 pr-2 py-1.5 text-xs text-white focus:border-accent2 focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                title="Clear search"
              >
                <X size={11} />
              </button>
            )}
          </div>
          <label className="text-[10px] text-gray-500 flex items-center gap-1">
            <ArrowUpDown size={10} />
            <select
              value={orderBy}
              onChange={(e) => setOrderBy(e.target.value)}
              className="bg-black border border-border rounded px-1.5 py-1 text-xs text-white"
            >
              <option value="views">Most viewed</option>
              <option value="likes">Most liked</option>
              <option value="comments">Most commented</option>
              <option value="published">Newest</option>
            </select>
          </label>
        </div>

        {/* Selected-video comparison card */}
        {selectedVideoId && (
          <VideoCompareCard
            compare={compare}
            acrossChannels={acrossChannels}
            loading={comparing}
            onClose={() => setSelectedVideoId("")}
          />
        )}

        {/* Video grid */}
        {loading ? (
          <div className="text-xs text-gray-500 flex items-center gap-1.5 py-6 justify-center">
            <Loader2 size={12} className="animate-spin" /> Loading videos…
          </div>
        ) : videos.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-6">
            {query
              ? <>No videos match <span className="text-gray-300">"{query}"</span>.</>
              : <>
                  No videos cached yet for this channel.
                  {" "}
                  Click <span className="text-gray-300">Sync from YouTube</span> above to pull the upload history.
                </>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {videos.map((v) => (
              <CatalogVideoCard
                key={v.video_id}
                video={v}
                selected={selectedVideoId === v.video_id}
                onClick={() =>
                  setSelectedVideoId(
                    selectedVideoId === v.video_id ? "" : v.video_id
                  )
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CatalogVideoCard({ video: v, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={v.title}
      className={`text-left bg-black/40 border rounded overflow-hidden flex flex-col transition-all hover:border-accent2 ${
        selected ? "border-accent2 ring-1 ring-accent2/40" : "border-border"
      }`}
    >
      <div className="relative bg-black" style={{ aspectRatio: "16/9" }}>
        {v.thumbnail_url ? (
          <img src={v.thumbnail_url}
               alt={v.title}
               className="w-full h-full object-cover"
               loading="lazy"
               onError={(e) => { e.target.style.display = "none"; }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700">
            <Youtube size={22} />
          </div>
        )}
        {v.duration_seconds > 0 && (
          <span className="absolute bottom-1 right-1 bg-black/80 text-[10px] text-white px-1 py-px rounded tabular-nums">
            {humanDuration(v.duration_seconds)}
          </span>
        )}
      </div>
      <div className="p-2 flex flex-col gap-1">
        <div className="text-[11px] text-gray-200 line-clamp-2 leading-snug min-h-[2.2rem]">
          {v.title || "—"}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><Eye size={9} /> {fmtNum(v.view_count)}</span>
          <span className="flex items-center gap-1"><ThumbsUp size={9} /> {fmtNum(v.like_count)}</span>
          <span className="flex items-center gap-1"><MessageSquare size={9} /> {fmtNum(v.comment_count)}</span>
          <span className="ml-auto">{relativeAgo(v.published_at)}</span>
        </div>
      </div>
    </button>
  );
}

function VideoCompareCard({ compare, acrossChannels, loading, onClose }) {
  if (loading) {
    return (
      <div className="bg-black/40 border border-border rounded p-3 mb-3 text-xs text-gray-500 flex items-center gap-1.5">
        <Loader2 size={12} className="animate-spin" /> Loading comparison…
      </div>
    );
  }
  if (!compare) return null;

  const v = compare.video;
  const ranks = compare.ranks || {};
  const ch = compare.channel_stats || {};

  return (
    <div className="bg-black/60 border border-accent2/40 rounded-lg p-3 mb-3">
      <div className="flex items-start gap-3 mb-3">
        {v.thumbnail_url ? (
          <img src={v.thumbnail_url}
               alt={v.title}
               className="w-28 aspect-video object-cover rounded bg-black/40 flex-shrink-0" />
        ) : (
          <div className="w-28 aspect-video bg-black/40 rounded flex items-center justify-center text-gray-700 flex-shrink-0">
            <Youtube size={20} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-white line-clamp-2" title={v.title}>
              {v.title || "—"}
            </h3>
            <button onClick={onClose} className="text-gray-500 hover:text-white flex-shrink-0"
                    title="Close comparison">
              <X size={14} />
            </button>
          </div>
          <div className="text-[10px] text-gray-500 mt-1 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1"><Eye size={9} /> {fmtNum(v.view_count)}</span>
            <span className="flex items-center gap-1"><ThumbsUp size={9} /> {fmtNum(v.like_count)}</span>
            <span className="flex items-center gap-1"><MessageSquare size={9} /> {fmtNum(v.comment_count)}</span>
            {v.published_at && <span className="flex items-center gap-1"><Calendar size={9} /> {relativeAgo(v.published_at)}</span>}
            <a href={`https://youtu.be/${v.video_id}`} target="_blank" rel="noreferrer"
               className="text-accent2 hover:text-accent flex items-center gap-1">
              <ExternalLink size={9} /> open
            </a>
          </div>
        </div>
      </div>

      {/* Percentile rank bars — top 10% / top 25% / etc. */}
      <div className="space-y-1.5 mb-3">
        <RankRow label="Views"    rank={ranks.views}    self={v.view_count}    pct={ch.views} />
        <RankRow label="Likes"    rank={ranks.likes}    self={v.like_count}    pct={ch.likes} />
        <RankRow label="Comments" rank={ranks.comments} self={v.comment_count} pct={ch.comments} />
      </div>

      {/* Peer videos — same channel, posted around the same time. */}
      {compare.peers?.length > 0 && (
        <div className="border-t border-border/60 pt-2 mb-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            Posted around the same time (this channel)
          </div>
          <div className="grid grid-cols-3 gap-2">
            {compare.peers.map((p) => (
              <a
                key={p.video_id}
                href={`https://youtu.be/${p.video_id}`}
                target="_blank"
                rel="noreferrer"
                className="bg-black/40 border border-border rounded p-1.5 flex gap-1.5 hover:border-accent2"
                title={p.title}
              >
                {p.thumbnail_url ? (
                  <img src={p.thumbnail_url} alt=""
                       className="w-14 aspect-video object-cover rounded flex-shrink-0" />
                ) : (
                  <div className="w-14 aspect-video bg-black/40 rounded flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] text-gray-200 line-clamp-2 leading-tight">
                    {p.title || "—"}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5 flex gap-1.5">
                    <span>{fmtNum(p.view_count)}v</span>
                    <span>{fmtNum(p.like_count)}l</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Feature 3 — same video's rank in every connected channel.
          Answers "if I had posted this on channel B, where would it
          rank?". Channels with no synced catalogue render the
          "Sync this channel" hint instead of fake stats. */}
      {acrossChannels?.channels?.length > 0 && (
        <div className="border-t border-border/60 pt-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            Same video ranked across all your channels
          </div>
          <div className="space-y-1.5">
            {acrossChannels.channels.map((row) => (
              <AcrossChannelsRow key={row.google_channel_id} row={row} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AcrossChannelsRow({ row }) {
  const r = row;
  const viewsRank = r.ranks?.views;       // null when needs_sync
  const rankPct = viewsRank != null ? Math.round(viewsRank * 100) : null;
  const tag =
    rankPct == null ? "" :
    rankPct >= 90 ? "top 10%" :
    rankPct >= 75 ? "top 25%" :
    rankPct >= 50 ? "above median" :
    rankPct >= 25 ? "below median" :
    "bottom 25%";
  const tagClass =
    rankPct == null ? "text-gray-500" :
    rankPct >= 75 ? "text-green-400" :
    rankPct >= 50 ? "text-accent2" :
    rankPct >= 25 ? "text-yellow-300" :
    "text-red-400";

  return (
    <div className="flex items-center gap-2 text-[11px] bg-black/30 border border-border rounded p-1.5">
      {r.channel_thumbnail_url ? (
        <img src={r.channel_thumbnail_url}
             alt={r.youtube_channel_title}
             className="w-6 h-6 rounded-full bg-black/40 object-cover flex-shrink-0"
             onError={(e) => { e.target.style.display = "none"; }} />
      ) : (
        <Youtube size={14} className="text-red-400 flex-shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-gray-200 truncate flex items-center gap-1">
          {r.youtube_channel_title || r.google_channel_id}
          {r.is_home && (
            <span className="text-[9px] text-accent2 border border-accent2/40 rounded px-1 py-px uppercase tracking-wider">
              home
            </span>
          )}
        </div>
        <div className="text-[10px] text-gray-500">
          {r.needs_sync
            ? "Sync this channel to compare"
            : `${r.total_videos} videos · median ${fmtNum(r.channel_medians?.views || 0)} views`}
        </div>
      </div>
      {r.needs_sync ? (
        <span className="text-[10px] text-gray-500 italic">not synced</span>
      ) : (
        <>
          <div className="w-20 h-2 bg-black rounded overflow-hidden flex-shrink-0">
            <div className="h-full bg-gradient-to-r from-accent2 to-accent"
                 style={{ width: `${rankPct}%` }} />
          </div>
          <div className={`w-20 text-right ${tagClass}`}>
            {tag} · {rankPct}%
          </div>
        </>
      )}
    </div>
  );
}

function RankRow({ label, rank, self, pct }) {
  // ``rank`` is 0..1 — percentile rank in the channel (1 = top).
  const r = Math.round((rank || 0) * 100);
  const labelClass =
    r >= 90 ? "text-green-400" :
    r >= 75 ? "text-accent2" :
    r >= 50 ? "text-yellow-300" :
    "text-red-400";
  const tag =
    r >= 90 ? "top 10%" :
    r >= 75 ? "top 25%" :
    r >= 50 ? "above median" :
    r >= 25 ? "below median" :
    "bottom 25%";
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <div className="w-16 text-gray-500 flex-shrink-0">{label}</div>
      <div className="flex-1 h-3 bg-black rounded overflow-hidden relative">
        <div className="h-full bg-gradient-to-r from-accent2 to-accent transition-all"
             style={{ width: `${r}%` }} />
        {pct?.p50 != null && (
          <div className="absolute top-0 bottom-0 w-px bg-gray-400/60"
               style={{ left: "50%" }} title="channel median" />
        )}
      </div>
      <div className={`w-16 text-right tabular-nums ${labelClass}`}>{fmtNum(self || 0)}</div>
      <div className={`w-20 text-right text-[10px] ${labelClass}`}>{tag}</div>
    </div>
  );
}

// ─── Format helpers ───────────────────────────────────────────

function humanDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function relativeAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60)      return "just now";
  if (diff < 3600)    return `${Math.floor(diff / 60)}m`;
  if (diff < 86400)   return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo`;
  return `${Math.floor(diff / 31536000)}y`;
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

// ── SEO Learning tab — per channel, what the feedback loop has learnt ──────
// Reads /api/performance/seo-learning. Each card shows the channel's status
// (learning vs collecting data), the signal in use (CTR once re-approved, else
// views), how many videos it has learnt from, and its "winning keywords".
const HOOK_LABELS = {
  question: "Question hooks", number: "Number-led", quote: "Quote-led",
  power: "Power-word", plain: "Plain factual",
};
const SCRIPT_LABELS = {
  mixed: "English + Telugu mixed", english: "English", native: "Native script",
};
const LEN_LABELS = { short: "<50 chars", sweet: "50–80 chars", long: "80–95 chars" };

/** Enterprise "AI is learning" emblem — a live comms hub: a pulsing
 * learning core, orbiting satellite nodes, and signal packets traveling
 * the orbit rings (stroke-dash offset), all driven by the REAL server
 * step text (syncing history → polling stats → ingesting CTR →
 * recomputing policy). Pure SVG/CSS, no deps; honours reduced-motion. */
function SeoLearningAura({ msg }) {
  const steps = ["Syncing history", "Polling stats", "Ingesting CTR", "Recomputing policy"];
  const lower = (msg || "").toLowerCase();
  // Best-effort: light up the step whose keyword the live message mentions.
  const kw = [["sync", 0], ["histor", 0], ["poll", 1], ["stat", 1],
              ["ctr", 2], ["impress", 2], ["report", 2],
              ["polic", 3], ["comput", 3], ["learn", 3]];
  let activeIdx = -1;
  for (const [k, i] of kw) { if (lower.includes(k)) { activeIdx = i; break; } }

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-accent2/30 bg-gradient-to-br from-accent2/10 via-transparent to-sky-500/5 px-3 py-3">
      <div className="flex items-center gap-3">
        <div className="relative h-14 w-14 flex-shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full">
            <defs>
              <radialGradient id="seoAuraCoreG" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#c4b5fd" />
                <stop offset="55%" stopColor="#7c6cff" />
                <stop offset="100%" stopColor="#4c3fd6" />
              </radialGradient>
              <filter id="seoAuraGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.2" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {/* Outer orbit ring + traveling signal packet */}
            <circle cx="60" cy="60" r="46" fill="none" stroke="#7c6cff" strokeOpacity="0.18" strokeWidth="1.5" />
            <circle cx="60" cy="60" r="46" fill="none" stroke="#a78bfa" strokeWidth="2.6" strokeLinecap="round"
                    strokeDasharray="7 82" className="seoAuraSig" />
            {/* Inner orbit ring + counter-traveling packet */}
            <circle cx="60" cy="60" r="30" fill="none" stroke="#2dd4bf" strokeOpacity="0.16" strokeWidth="1.5" />
            <circle cx="60" cy="60" r="30" fill="none" stroke="#2dd4bf" strokeWidth="2.6" strokeLinecap="round"
                    strokeDasharray="5 52" className="seoAuraSig2" />
            {/* Orbiting satellite nodes (data being pulled in) */}
            <g className="seoAuraOrbit">
              <line x1="60" y1="60" x2="60" y2="14" stroke="#a78bfa" strokeOpacity="0.25" strokeWidth="1" />
              <circle cx="60" cy="14" r="3.6" fill="#a78bfa" filter="url(#seoAuraGlow)" />
            </g>
            <g className="seoAuraOrbitRev">
              <line x1="60" y1="60" x2="60" y2="30" stroke="#2dd4bf" strokeOpacity="0.25" strokeWidth="1" />
              <circle cx="60" cy="30" r="2.7" fill="#2dd4bf" filter="url(#seoAuraGlow)" />
            </g>
            {/* Pulsing learning core */}
            <circle cx="60" cy="60" r="12" fill="none" stroke="#c4b5fd" strokeWidth="1.5" className="seoAuraHalo" />
            <circle cx="60" cy="60" r="11" fill="url(#seoAuraCoreG)" filter="url(#seoAuraGlow)" className="seoAuraCore" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-white flex items-center gap-1.5">
            <span className="seoAuraDot" /> Learning from this channel's real YouTube data
          </div>
          <div className="text-[11px] text-accent2 mt-0.5 truncate">{msg || "working…"}</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {steps.map((s, i) => (
              <span key={s}
                className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-colors duration-300 ${
                  i === activeIdx
                    ? "border-accent2 text-white bg-accent2/20"
                    : i < activeIdx
                      ? "border-emerald-500/30 text-emerald-300/70"
                      : "border-border text-gray-600"}`}>
                {i < activeIdx ? "✓ " : ""}{s}
              </span>
            ))}
          </div>
        </div>
      </div>
      <style>{`
        .seoAuraCore { transform-box: view-box; transform-origin: 60px 60px; animation: seoAuraPulse 1.6s ease-in-out infinite; }
        .seoAuraHalo { transform-box: view-box; transform-origin: 60px 60px; animation: seoAuraHalo 1.8s ease-out infinite; }
        .seoAuraOrbit { transform-box: view-box; transform-origin: 60px 60px; animation: seoAuraSpin 3.6s linear infinite; }
        .seoAuraOrbitRev { transform-box: view-box; transform-origin: 60px 60px; animation: seoAuraSpinRev 2.6s linear infinite; }
        .seoAuraSig { animation: seoAuraDash 1.5s linear infinite; }
        .seoAuraSig2 { animation: seoAuraDash2 1.15s linear infinite; }
        .seoAuraDot { display:inline-block; width:6px; height:6px; border-radius:9999px; background:#7c6cff; animation: seoAuraDotPulse 1.6s ease-out infinite; }
        @keyframes seoAuraPulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.16);opacity:.9} }
        @keyframes seoAuraHalo { 0%{transform:scale(1);opacity:.7} 100%{transform:scale(2.3);opacity:0} }
        @keyframes seoAuraSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes seoAuraSpinRev { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
        @keyframes seoAuraDash { to { stroke-dashoffset: -89; } }
        @keyframes seoAuraDash2 { to { stroke-dashoffset: 57; } }
        @keyframes seoAuraDotPulse { 0%{box-shadow:0 0 0 0 rgba(124,108,255,.55)} 70%{box-shadow:0 0 0 6px rgba(124,108,255,0)} 100%{box-shadow:0 0 0 0 rgba(124,108,255,0)} }
        @media (prefers-reduced-motion: reduce) {
          .seoAuraCore,.seoAuraHalo,.seoAuraOrbit,.seoAuraOrbitRev,.seoAuraSig,.seoAuraSig2,.seoAuraDot { animation: none; }
        }
      `}</style>
    </div>
  );
}

/** Learning-curve panel: REAL per-day performance + snapshot timeline for
 * one channel. Every number comes from measured TrainingSample rows — an
 * empty window says so honestly instead of drawing a fake curve. */
function LearningCurve({ channelId, channelName }) {
  const [days, setDays] = useState(30);
  const [curve, setCurve] = useState(null);
  const [busy, setBusy] = useState(false);
  const [relearning, setRelearning] = useState(false);
  const [learnMsg, setLearnMsg] = useState("");
  const [err, setErr] = useState("");

  const load = () => {
    if (!channelId) return;
    setBusy(true); setErr("");
    api.seoLearningCurves(channelId, days)
      .then(setCurve)
      .catch((e) => setErr(e?.message || "Failed to load curves"))
      .finally(() => setBusy(false));
  };
  useEffect(load, [channelId, days]);

  // The relearn runs SERVER-SIDE — poll its state so the learning
  // animation survives navigating to another section and back, and the
  // button can never reset while the server is still working.
  useEffect(() => {
    if (!channelId) return undefined;
    let alive = true;
    let timer = null;
    const tick = async () => {
      try {
        const st = await api.seoLearningRelearnStatus(channelId);
        if (!alive) return;
        const running = st?.state === "running";
        setRelearning((was) => {
          if (was && !running) load();      // finished while we watched → refresh
          return running;
        });
        setLearnMsg(running ? (st?.msg || "learning…") : "");
        timer = setTimeout(tick, running ? 2500 : 15000);
      } catch {
        if (alive) timer = setTimeout(tick, 15000);
      }
    };
    tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const relearn = async () => {
    try {
      setRelearning(true);
      setLearnMsg("starting…");
      await api.seoLearningRelearn(channelId);
    } catch (e) {
      setErr(e?.message || "Relearn failed");
      setRelearning(false);
    }
  };

  const series = curve?.series || [];
  const hasCtr = series.some((p) => p.avg_ctr != null);
  const latest = curve?.latest;

  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <TrendingUp size={15} className="text-accent2" />
          Learning curve — {channelName || `Channel #${channelId}`}
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-2 py-1 rounded text-[11px] font-medium border ${
                days === d ? "border-accent2 text-accent2 bg-accent2/10"
                           : "border-border text-gray-500 hover:text-gray-300"}`}>
              {d === 7 ? "Week" : d === 30 ? "Month" : "90 days"}
            </button>
          ))}
          <button onClick={relearn} disabled={relearning}
            className="flex items-center gap-1.5 bg-accent2 hover:bg-accent2/80 text-white px-2.5 py-1 rounded text-[11px] disabled:opacity-50">
            <RefreshCw size={11} className={relearning ? "animate-spin" : ""} />
            {relearning ? "Learning…" : "Learn now"}
          </button>
        </div>
      </div>

      {relearning && <SeoLearningAura msg={learnMsg} />}

      {err && <div className="text-[12px] text-red-300 mb-2">{err}</div>}
      {busy ? (
        <div className="text-gray-500 text-sm flex items-center gap-2 h-48 justify-center">
          <Loader2 className="animate-spin" size={14} /> Loading measured data…
        </div>
      ) : series.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-center text-[12px] text-gray-500">
          No videos published on this channel in the last {days} days —<br />
          nothing measured yet, so there is no curve to show. Publish and press “Learn now”.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <RLineChart data={series} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1e2530" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#5b6472" fontSize={10}
                   tickFormatter={(d) => d.slice(5)} />
            <YAxis yAxisId="vph" stroke="#5b6472" fontSize={10}
                   label={{ value: "views/hr", angle: -90, position: "insideLeft", fill: "#5b6472", fontSize: 10 }} />
            {hasCtr && <YAxis yAxisId="ctr" orientation="right" stroke="#5b6472" fontSize={10}
                   tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} />}
            <RTooltip
              contentStyle={{ background: "#0e1218", border: "1px solid #2a3240", borderRadius: 8, fontSize: 12 }}
              formatter={(v, name) => name === "CTR" ? [`${(v * 100).toFixed(2)}%`, name] : [v, name]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="vph" dataKey="avg_vph" name="Views/hour" stroke="#7c6cff"
                  strokeWidth={2} dot={{ r: 2 }} connectNulls />
            {hasCtr && <Line yAxisId="ctr" dataKey="avg_ctr" name="CTR" stroke="#2dd4bf"
                  strokeWidth={2} dot={{ r: 2 }} connectNulls />}
          </RLineChart>
        </ResponsiveContainer>
      )}

      {latest?.policy ? (
        <div className="mt-3 pt-3 border-t border-border/60">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            What this channel has LEARNED (steering its SEO now — from {latest.policy.based_on} measured videos)
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {(latest.policy.best_hooks || []).map((h) => (
              <span key={h} className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                ✓ {HOOK_LABELS[h] || h} win here
              </span>
            ))}
            {latest.policy.best_script && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                ✓ Titles: {SCRIPT_LABELS[latest.policy.best_script]}
              </span>
            )}
            {latest.policy.best_len_band && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                ✓ Length: {LEN_LABELS[latest.policy.best_len_band]}
              </span>
            )}
            {(latest.policy.top_keywords || []).slice(0, 6).map((k) => (
              <span key={k} className="px-1.5 py-0.5 rounded bg-accent2/10 text-accent2 border border-accent2/20">{k}</span>
            ))}
            {(latest.policy.top_topics || []).slice(0, 4).map((t) => (
              <span key={t} className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20"
                    title="Topic angles measured to win on this channel">◈ {t}</span>
            ))}
            {(latest.policy.best_hours || []).length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20"
                    title="Upload hours (IST) whose videos historically earn the most views/hour">
                ⏰ best upload: {(latest.policy.best_hours || []).map((h) => `${h}:00`).join(", ")} IST
              </span>
            )}
          </div>
          <div className="text-[10px] text-gray-600 mt-1.5">
            Real CTR on {latest.ctr_coverage || 0} of {latest.samples} videos
            {(latest.ctr_coverage || 0) === 0 && (
              <span> — CTR reports were requested from YouTube when you first pressed
              "Learn now"; YouTube generates them within ~1–2 days, then CTR flows in daily</span>
            )} · these learned rules are injected into every new SEO generation for this channel.
          </div>
          {/* Honesty instruments — measured, never decorative */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {curve?.uplift?.vph_uplift_pct != null && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                curve.uplift.vph_uplift_pct >= 0
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                  : "bg-red-500/10 text-red-300 border-red-500/20"}`}
                title="Average views/hour of the last 7 days' videos vs the prior 30 days — the measured before/after">
                {curve.uplift.vph_uplift_pct >= 0 ? "▲" : "▼"} {Math.abs(curve.uplift.vph_uplift_pct)}% vs prior 30d
              </span>
            )}
            {curve?.score_audit?.verdict && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                curve.score_audit.verdict === "score_predicts"
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                  : "bg-red-500/10 text-red-300 border-red-500/20"}`}
                title="Do 90+ scored SEOs actually earn more views/hour than lower-scored ones? Computed from published results.">
                score audit: {curve.score_audit.verdict === "score_predicts" ? "score predicts reality ✓" : "score does NOT predict — rubric needs revision"}
              </span>
            )}
            {(latest?.explorations?.n || 0) > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20"
                title={Object.entries(latest.explorations.by_hook || {})
                  .map(([h, s]) => `${h}: ${s.avg_vph} v/hr (n=${s.n})`).join(" · ")
                  + ` — baseline ${latest.explorations.baseline_avg_vph} v/hr`}>
                🧪 {latest.explorations.n} A/B experiment{latest.explorations.n === 1 ? "" : "s"} measured
              </span>
            )}
          </div>
        </div>
      ) : !busy && series.length > 0 ? (
        <div className="mt-3 pt-3 border-t border-border/60 text-[11px] text-gray-500">
          Collecting honestly: {curve?.latest?.samples ?? 0} measured videos in this window —
          a steering policy forms at 5+ (no fake learning shown before that).
        </div>
      ) : null}
    </div>
  );
}

/** Best-time-to-post report — measured upload-hour + weekday performance
 * (avg views/hour + real CTR + sample counts) from the channel's REAL
 * history, IST. Recommends the top hours/days. Every number is measured;
 * an honest empty-state when the history is too thin to trust a time. */
function BestTimesReport({ channelId, channelName }) {
  const [days, setDays] = useState(3650);
  const [rep, setRep] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [selDow, setSelDow] = useState(null);   // drill-down weekday

  useEffect(() => {
    if (!channelId) return;
    setBusy(true); setErr("");
    api.seoLearningBestTimes(channelId, days)
      .then((r) => { setRep(r); setSelDow(r?.peak?.dow || "Mon"); })
      .catch((e) => setErr(e?.message || "Failed to load best times"))
      .finally(() => setBusy(false));
  }, [channelId, days]);

  const fmtHour = (h) => `${String(h).padStart(2, "0")}:00`;
  const tz = rep?.timezone || "IST";                 // "IST" or "local time"
  const fromDoctor = rep?.source === "channel_doctor";
  const grid = rep?.grid || [];
  // Peak cell vph across the whole 7×24 grid — drives the heatmap intensity.
  const maxCell = Math.max(1, ...grid.flatMap((d) => d.hours.map((c) => c.avg_vph || 0)));
  const selRow = grid.find((d) => d.dow === selDow) || null;
  const selHours = selRow?.hours || [];
  const maxSel = Math.max(1, ...selHours.map((c) => c.avg_vph || 0));
  // Priority ranking for the drilled-down day — qualifying hours (>=3
  // videos, real signal) sorted best→worst.
  const selRanked = selHours.filter((c) => c.n >= 3 && c.avg_vph > 0)
    .sort((a, b) => (b.avg_vph - a.avg_vph) || ((b.avg_ctr || 0) - (a.avg_ctr || 0)));
  const selBest = selRanked[0] || null;
  const selTopVph = selBest?.avg_vph || 0;
  // Weekly priority — the strongest day×hour slots across the whole week.
  const weekTop = grid
    .flatMap((d) => d.hours.filter((c) => c.n >= 3 && c.avg_vph > 0)
      .map((c) => ({ ...c, dow: d.dow, label: d.label })))
    .sort((a, b) => (b.avg_vph - a.avg_vph) || ((b.avg_ctr || 0) - (a.avg_ctr || 0)))
    .slice(0, 5);
  const weekTopVph = weekTop[0]?.avg_vph || 0;
  // Tier a slot by its strength RELATIVE to the best in its list — honest
  // "best / good / fair" rather than absolute thresholds.
  const tierOf = (vph, top) => {
    const r = top > 0 ? vph / top : 0;
    if (r >= 0.85) return { label: "Best", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
    if (r >= 0.60) return { label: "Good", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" };
    return { label: "Fair", cls: "bg-white/5 text-gray-400 border-border" };
  };

  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Clock size={15} className="text-sky-400" />
          Best time to post — {channelName || `Channel #${channelId}`}
        </div>
        <div className="flex items-center gap-2">
          {[{ v: 30, l: "Month" }, { v: 90, l: "90 days" }, { v: 3650, l: "All-time" }].map((o) => (
            <button key={o.v} onClick={() => setDays(o.v)}
              className={`px-2 py-1 rounded text-[11px] font-medium border ${
                days === o.v ? "border-sky-400 text-sky-300 bg-sky-500/10"
                             : "border-border text-gray-500 hover:text-gray-300"}`}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="text-[12px] text-red-300 mb-2">{err}</div>}
      {busy ? (
        <div className="text-gray-500 text-sm flex items-center gap-2 h-40 justify-center">
          <Loader2 className="animate-spin" size={14} /> Loading measured upload times…
        </div>
      ) : !rep ? null : (
        <>
          {/* PEAK — post your best video here */}
          {rep.peak ? (
            <div className="mb-3 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2.5">
              <div className="text-[13px] text-white flex items-center gap-1.5 flex-wrap">
                <Trophy size={14} className="text-amber-300" />
                Post your <span className="font-semibold text-amber-200">best video</span> around
                <span className="font-bold text-amber-200">{fmtHour(rep.peak.hour)} {tz}</span>
                on <span className="font-bold text-amber-200">{rep.peak.label}</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                Its uploads averaged {rep.peak.avg_vph} views/hour across {rep.peak.n} videos
                {rep.peak.avg_ctr != null && <> · CTR {(rep.peak.avg_ctr * 100).toFixed(1)}%</>}
                {" "}— the single strongest slot measured.
              </div>
            </div>
          ) : (
            <div className="mb-3 rounded-lg border border-border bg-black/20 px-3 py-3 text-[12px] text-gray-400">
              {rep.recommendation?.reason || "Not enough measured history yet to recommend a time — keep publishing and press “Learn now”."}
            </div>
          )}

          {/* WEEKLY PRIORITY — the strongest day+time slots, ranked */}
          {weekTop.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
                This week's top slots (by priority)
              </div>
              <div className="space-y-1">
                {weekTop.map((c, i) => {
                  const t = tierOf(c.avg_vph, weekTopVph);
                  return (
                    <div key={`${c.dow}-${c.hour}`} className="flex items-center gap-2 text-[11px]">
                      <span className="w-4 text-gray-600 text-right">{i + 1}</span>
                      <span className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold w-10 text-center ${t.cls}`}>{t.label}</span>
                      <span className="text-gray-200 font-medium w-24">{c.label} {fmtHour(c.hour)}</span>
                      <span className="text-gray-500">{c.avg_vph} views/hr · {c.n} video{c.n === 1 ? "" : "s"}
                        {c.avg_ctr != null && <> · CTR {(c.avg_ctr * 100).toFixed(1)}%</>}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 7×24 HEATMAP — day × hour (IST) */}
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            Views / hour heatmap — day × upload hour ({tz}) · brighter = faster start
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[520px]">
              <div className="grid gap-[2px] mb-[2px]" style={{ gridTemplateColumns: "30px repeat(24, 1fr)" }}>
                <div />
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="text-[8px] text-gray-500 text-center tabular-nums leading-none">{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</div>
                ))}
              </div>
              {grid.map((d) => (
                <div key={d.dow} className="grid gap-[2px] mb-[2px] items-center" style={{ gridTemplateColumns: "30px repeat(24, 1fr)" }}>
                  <button onClick={() => setSelDow(d.dow)}
                    className={`text-[10px] text-left ${d.dow === selDow ? "text-sky-300 font-semibold" : "text-gray-500 hover:text-gray-300"}`}>
                    {d.dow}
                  </button>
                  {d.hours.map((c) => {
                    const isPeak = rep.peak && rep.peak.dow === d.dow && rep.peak.hour === c.hour;
                    const thin = c.n > 0 && c.n < 3;
                    const a = 0.10 + (c.avg_vph / maxCell) * 0.85;
                    return (
                      <div key={c.hour}
                        title={`${d.label} ${fmtHour(c.hour)} ${tz} · ${c.avg_vph} views/hr · ${c.n} video${c.n === 1 ? "" : "s"}${c.avg_ctr != null ? ` · CTR ${(c.avg_ctr * 100).toFixed(1)}%` : ""}${thin ? " · low confidence" : ""}`}
                        className="aspect-square rounded-[2px]"
                        style={{
                          background: c.n === 0 ? "rgba(255,255,255,0.03)"
                            : `rgba(56,189,248,${(thin ? Math.min(a, 0.3) : a).toFixed(3)})`,
                          outline: isPeak ? "1.5px solid #fbbf24" : undefined,
                          outlineOffset: isPeak ? "-1px" : undefined,
                        }} />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="text-[10px] text-gray-600 mt-1">
            Columns = upload hour in {tz} (<span className="text-gray-400">00–23, so 18 = 6&nbsp;PM</span>); rows = weekday.
            Hover any square for its exact time + views/hr. The amber-ringed square is your peak slot.
          </div>

          {/* DAY DRILL-DOWN — pick a weekday → its hour-by-hour detail */}
          <div className="mt-4 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 mr-1">Day detail:</span>
            {grid.map((d) => (
              <button key={d.dow} onClick={() => setSelDow(d.dow)}
                className={`px-1.5 py-0.5 rounded text-[10px] border ${
                  d.dow === selDow ? "border-sky-400 text-sky-300 bg-sky-500/10"
                                   : "border-border text-gray-500 hover:text-gray-300"}`}>
                {d.dow}
              </button>
            ))}
          </div>
          {selRow && (
            <div className="mt-2">
              <div className="text-[11px] text-gray-400 mb-1">
                {selRow.label}:{" "}
                {selBest
                  ? <>best hour <span className="text-sky-300 font-semibold">{fmtHour(selBest.hour)} {tz}</span> ({selBest.avg_vph} views/hr, {selBest.n} videos)</>
                  : <span className="text-gray-500">not enough videos posted on {selRow.label} yet to pick an hour.</span>}
              </div>
              <div className="flex items-end gap-[2px] h-20">
                {selHours.map((c) => {
                  const pct = Math.round(((c.avg_vph || 0) / maxSel) * 100);
                  const best = selBest && selBest.hour === c.hour;
                  const thin = c.n > 0 && c.n < 3;
                  return (
                    <div key={c.hour} className="flex-1 flex flex-col justify-end h-full group"
                      title={`${selRow.label} ${fmtHour(c.hour)} ${tz} · ${c.avg_vph} views/hr · ${c.n} video${c.n === 1 ? "" : "s"}${thin ? " · low confidence" : ""}`}>
                      <div className={`w-full rounded-t ${
                        best ? "bg-amber-400"
                        : c.n === 0 ? "bg-white/5"
                        : thin ? "bg-sky-500/25" : "bg-sky-500/50 group-hover:bg-sky-500/70"}`}
                        style={{ height: `${c.n === 0 ? 2 : Math.max(3, pct)}%` }} />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[9px] text-gray-600 mt-1">
                {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => <span key={h}>{fmtHour(h)}</span>)}
              </div>

              {/* PER-DAY PRIORITY — this day's times ranked best→fair */}
              {selRanked.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
                    {selRow.label} — times by priority
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selRanked.slice(0, 6).map((c, i) => {
                      const t = tierOf(c.avg_vph, selTopVph);
                      return (
                        <div key={c.hour}
                          title={`${c.avg_vph} views/hr across ${c.n} video${c.n === 1 ? "" : "s"}${c.avg_ctr != null ? ` · CTR ${(c.avg_ctr * 100).toFixed(1)}%` : ""}`}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] ${t.cls}`}>
                          <span className="text-[9px] opacity-70">#{i + 1}</span>
                          <span className="font-semibold">{fmtHour(c.hour)} {tz}</span>
                          <span className="text-[9px] opacity-80">{t.label}</span>
                          <span className="text-[9px] opacity-60">{c.avg_vph}/hr</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="text-[10px] text-gray-600 mt-3">
            Based on {rep.samples} measured video{rep.samples === 1 ? "" : "s"}
            {rep.ctr_coverage > 0 && <> · {rep.ctr_coverage} with real thumbnail CTR</>}
            {" "}· ranked by {rep.signal === "ctr" ? "real click-through rate" : "views/hour"} · times in {tz}.
            {" "}Faint cells = too few videos to trust yet; they fill in as you publish.
            {fromDoctor
              ? <span className="text-gray-500"> · Source: <strong className="text-gray-400">Channel Doctor</strong> (your full YouTube catalogue) — matches the Channel Doctor tab.</span>
              : <span className="text-gray-500"> · Run <strong className="text-gray-400">Channel Doctor</strong> for the full-catalogue timing.</span>}
          </div>
        </>
      )}
    </div>
  );
}

/** Weekly uplift rollup — the multi-week view behind the single 7-vs-30
 * uplift chip. Per-week measured avg views/hour + week-over-week %, empty
 * weeks shown as gaps. Honest "need 2 measured weeks" state. */
function WeeklyUpliftPanel({ channelId, channelName }) {
  const [rep, setRep] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!channelId) return;
    setBusy(true); setErr("");
    api.seoLearningWeeklyUplift(channelId, 8)
      .then(setRep)
      .catch((e) => setErr(e?.message || "Failed to load weekly uplift"))
      .finally(() => setBusy(false));
  }, [channelId]);

  const series = rep?.series || [];
  const maxVph = Math.max(1, ...series.map((w) => w.avg_vph || 0));
  const fmtWk = (iso) => {
    const d = new Date(`${iso}T00:00:00`);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };
  const wow = rep?.latest_wow_pct;

  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <BarChart3 size={15} className="text-emerald-400" />
          Weekly uplift — {channelName || `Channel #${channelId}`}
        </div>
        {rep?.enough_data && wow != null && (
          <span className={`text-[11px] px-2 py-0.5 rounded border ${
            wow >= 0 ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                     : "bg-red-500/10 text-red-300 border-red-500/20"}`}
            title="Latest week's avg views/hour vs the previous measured week">
            {wow >= 0 ? "▲" : "▼"} {Math.abs(wow)}% this week
          </span>
        )}
      </div>

      {err && <div className="text-[12px] text-red-300 mb-2">{err}</div>}
      {busy ? (
        <div className="text-gray-500 text-sm flex items-center gap-2 h-24 justify-center">
          <Loader2 className="animate-spin" size={14} /> Loading weekly rollup…
        </div>
      ) : !rep ? null : !rep.enough_data ? (
        <div className="rounded-lg border border-border bg-black/20 px-3 py-3 text-[12px] text-gray-400">
          Collecting honestly — a weekly trend needs at least 2 weeks with published
          videos. Keep publishing and it fills in.
        </div>
      ) : (
        <>
          <div className="flex items-end gap-1.5 h-28">
            {series.map((w) => {
              const pct = Math.round(((w.avg_vph || 0) / maxVph) * 100);
              const up = w.wow_pct != null && w.wow_pct >= 0;
              return (
                <div key={w.week_start} className="flex-1 flex flex-col items-center justify-end h-full group"
                  title={`Week of ${w.week_start} · ${w.published} video${w.published === 1 ? "" : "s"} · ${w.avg_vph} views/hr${w.avg_ctr != null ? ` · CTR ${(w.avg_ctr * 100).toFixed(1)}%` : ""}${w.wow_pct != null ? ` · ${w.wow_pct >= 0 ? "+" : ""}${w.wow_pct}% WoW` : ""}`}>
                  <div className={`w-full rounded-t transition-colors ${
                    w.published === 0 ? "bg-white/5"
                    : up ? "bg-emerald-500/50 group-hover:bg-emerald-500/70"
                         : "bg-red-500/40 group-hover:bg-red-500/60"}`}
                    style={{ height: `${w.published === 0 ? 2 : Math.max(3, pct)}%` }} />
                </div>
              );
            })}
          </div>
          <div className="flex gap-1.5 mt-1">
            {series.map((w) => (
              <div key={w.week_start} className="flex-1 text-center text-[9px] text-gray-600">{fmtWk(w.week_start)}</div>
            ))}
          </div>
          <div className="text-[10px] text-gray-600 mt-2">
            Avg views/hour per week (green = up vs the previous measured week, red = down);
            empty bars are weeks with no publishes. All measured.
          </div>
        </>
      )}
    </div>
  );
}

/** Tracked rivals: their learned formula from PUBLIC data + Learn button.
 * Honest by construction: rival CTR is private and never shown. */
function CompetitorsPanel() {
  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState("");

  const load = () => api.competitorsList().then(setData)
    .catch((e) => setErr(e?.message || "Failed to load competitors"));
  useEffect(() => { load(); }, []);

  const learn = async (id) => {
    setBusyId(id);
    try { await api.competitorLearn(id); await load(); }
    catch (e) { setErr(e?.message || "Learn failed"); }
    finally { setBusyId(null); }
  };

  const comps = data?.competitors || [];
  const [newName, setNewName] = useState("");
  const [newRef, setNewRef] = useState("");
  const [adding, setAdding] = useState(false);
  const add = async () => {
    if (!newName.trim() || !newRef.trim()) return;
    setAdding(true);
    try {
      await api.createCompetitor({
        name: newName.trim(),
        youtube_channel_id: newRef.trim(),
        handle: newRef.trim().startsWith("@") ? newRef.trim() : "",
      });
      setNewName(""); setNewRef("");
      await load();
    } catch (e) { setErr(e?.message || "Add failed"); }
    finally { setAdding(false); }
  };
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-sm font-semibold text-white flex items-center gap-2">
          <Search size={14} className="text-amber-300" /> Competitors (public data)
        </div>
        <div className="flex items-center gap-1.5">
          <input value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Name (e.g. TV9 Telugu)"
            className="bg-[#0e1218] border border-border rounded px-2 py-1 text-[11px] text-gray-200 w-36" />
          <input value={newRef} onChange={(e) => setNewRef(e.target.value)}
            placeholder="@handle / channel URL / UC id"
            className="bg-[#0e1218] border border-border rounded px-2 py-1 text-[11px] text-gray-200 w-48" />
          <button onClick={add} disabled={adding || !newName.trim() || !newRef.trim()}
            className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-2.5 py-1 rounded text-[11px] disabled:opacity-40">
            {adding ? "Adding…" : "+ Track"}
          </button>
        </div>
      </div>
      {err && <div className="text-[12px] text-red-300 mb-2">{err}</div>}
      {comps.length === 0 ? (
        <div className="text-[12px] text-gray-500">
          No competitors tracked yet — add a rival above (name + @handle or channel URL), then press Learn.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {comps.map((c) => (
            <div key={c.id} className="rounded-lg border border-border bg-[#0e1218] p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-semibold text-white truncate">{c.name}</span>
                <button onClick={() => learn(c.id)} disabled={busyId === c.id}
                  className="flex items-center gap-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded text-[10px] disabled:opacity-50">
                  <RefreshCw size={10} className={busyId === c.id ? "animate-spin" : ""} />
                  {busyId === c.id ? "Learning…" : "Learn"}
                </button>
              </div>
              <div className="text-[10px] text-gray-500 mb-1.5">{c.samples || 0} videos analyzed</div>
              {c.policy && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {(c.policy.best_hooks || []).map((h) => (
                    <span key={h} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">{h} hooks</span>
                  ))}
                  {c.policy.best_script && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">{c.policy.best_script} titles</span>
                  )}
                </div>
              )}
              {(c.top_topics || []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {c.top_topics.slice(0, 4).map((t) => (
                    <span key={t.term} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400 border border-border" title={`${t.avg_vph} views/hr across ${t.n} videos`}>{t.term}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeoLearningTab({ ytChannels = [], initialGcid = "" }) {
  const [data, setData]   = useState(null);
  const [busy, setBusy]   = useState(true);
  const [err, setErr]     = useState("");
  const [selected, setSelected] = useState(null);
  // SEO Settings sub-tabs: "owned" (this account's channels — learning
  // curve, best-time report, weekly uplift, per-channel cards) |
  // "competitors" (writing-voice study channels + tracked rivals) |
  // "doctor" (the Channel Doctor holistic AI diagnosis, merged in here so
  // all of Insights' analysis lives in one hub).
  const [subTab, setSubTab] = useState("owned");

  useEffect(() => {
    let alive = true;
    setBusy(true); setErr("");
    api.seoLearning()
      .then((d) => {
        if (!alive) return;
        setData(d);
        const first = (d?.channels || [])[0];
        if (first) setSelected((s) => s ?? first.channel_id);
      })
      .catch((e) => { if (alive) setErr(e?.message || "Failed to load SEO learning"); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, []);

  if (busy) {
    return <div className="text-gray-400 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading SEO learning…</div>;
  }
  if (err) {
    return <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded flex items-center gap-2"><AlertCircle size={14} /> {err}</div>;
  }
  const channels = data?.channels || [];
  const learning = channels.filter((c) => c.ready).length;
  const steering = channels.filter((c) => c.policy).length;
  const selectedChannel = channels.find((c) => c.channel_id === selected);

  return (
    <div className="space-y-4">
      {/* SEO Settings sub-tabs — Owned Channels | Competitors | Channel Doctor */}
      <div className="flex items-center gap-1 border-b border-border">
        {[
          { k: "owned", label: "Owned Channels", Icon: Youtube },
          { k: "competitors", label: "Competitors", Icon: Swords },
          { k: "doctor", label: "Channel Doctor", Icon: Stethoscope },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setSubTab(t.k)}
            className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors flex items-center gap-1.5 ${
              subTab === t.k
                ? "border-accent2 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <t.Icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {subTab === "competitors" ? (
        <div className="space-y-4">
          {/* Writing-voice study channels (moved here from the Channels page) */}
          <StyleReferencesPanel />
          {/* Topic radar — tracked rivals' winning topics/keywords from public data */}
          <CompetitorsPanel />
        </div>
      ) : subTab === "doctor" ? (
        /* Channel Doctor — holistic AI diagnosis (merged into this hub) */
        <TrendFinderTab ytChannels={ytChannels} initialGcid={initialGcid} />
      ) : (
      <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <Zap size={15} className="text-accent2" />
          <span>
            <strong className="text-white">{steering}</strong> steering SEO ·{" "}
            <strong className="text-white">{learning}</strong> of {channels.length} channel{channels.length === 1 ? "" : "s"} learning
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500">SEO writer:</span>
          {["gemini", "claude", "openai"].map((e) => (
            <button key={e}
              onClick={async () => {
                try { await api.seoEngineSet(e); setData((d) => ({ ...d, seo_engine: e })); }
                catch { /* keep old */ }
              }}
              title={e === "claude"
                ? "Claude writes the SEO (auto-falls back to Gemini on failure)"
                : e === "openai"
                  ? "ChatGPT writes the SEO — BYO OpenAI key (auto-falls back to Gemini on failure)"
                  : "Gemini writes the SEO (default)"}
              className={`px-2 py-1 rounded text-[11px] font-medium border capitalize ${
                (data?.seo_engine || "gemini") === e
                  ? "border-accent2 text-accent2 bg-accent2/10"
                  : "border-border text-gray-500 hover:text-gray-300"}`}>
              {e}
            </button>
          ))}
        </div>
        {data?.note && <p className="text-[11px] text-gray-500 max-w-xl">{data.note}</p>}
      </div>

      {channels.length > 0 && selected && (
        <LearningCurve channelId={selected} channelName={selectedChannel?.channel_name} />
      )}

      {channels.length > 0 && selected && (
        <BestTimesReport channelId={selected} channelName={selectedChannel?.channel_name} />
      )}

      {channels.length > 0 && selected && (
        <WeeklyUpliftPanel channelId={selected} channelName={selectedChannel?.channel_name} />
      )}

      {channels.length === 0 ? (
        <div className="bg-[#111] border border-border rounded p-6 text-center text-sm text-gray-500">
          No connected channels yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {channels.map((c) => (
            <div
              key={c.channel_id}
              onClick={() => setSelected(c.channel_id)}
              className={`rounded-xl border p-4 bg-panel transition-colors cursor-pointer ${
                selected === c.channel_id ? "border-accent2 ring-1 ring-accent2/40"
                : c.policy ? "border-emerald-500/40"
                : c.ready ? "border-accent2/40" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Youtube size={14} className="text-red-400 flex-shrink-0" />
                  <span className="text-sm font-semibold text-white truncate">{c.channel_name || `Channel #${c.channel_id}`}</span>
                </div>
                <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                  c.policy ? "bg-emerald-500/20 text-emerald-300"
                  : c.ready ? "bg-accent2/20 text-accent2" : "bg-gray-700 text-gray-400"
                }`}>
                  {c.status || (c.ready ? "learning" : "collecting")}
                </span>
              </div>

              <div className="flex items-center gap-3 text-[11px] text-gray-400 mb-3">
                <span className="inline-flex items-center gap-1" title="Signal used to rank what works">
                  {c.signal === "ctr" ? <Trophy size={11} className="text-yellow-400" /> : <Eye size={11} />}
                  {c.signal === "ctr" ? "CTR" : "views"}
                </span>
                <span>·</span>
                <span>{c.videos_sampled} video{c.videos_sampled === 1 ? "" : "s"} learnt from</span>
                {c.ctr_rows > 0 && (
                  <span title="Videos with REAL thumbnail CTR from YouTube">· {c.ctr_rows} with real CTR</span>
                )}
                {!c.ctr_unlocked && (
                  <span className="ml-auto text-[10px] text-gray-600" title="Re-approve this channel for analytics to unlock CTR">CTR locked</span>
                )}
              </div>

              <label className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-2 cursor-pointer"
                     onClick={(e) => e.stopPropagation()}
                     title="Opt-in: SEO for this channel also uses tracked competitors' topic-matched public data (their winning queries + tags, differentiated titles)">
                <input type="checkbox"
                  defaultChecked={!!c.use_competitor_intel}
                  onChange={async (e) => {
                    try { await api.competitorToggle(c.channel_id, e.target.checked); }
                    catch { e.target.checked = !e.target.checked; }
                  }}
                  className="accent-amber-400" />
                use competitor intelligence in SEO
              </label>

              {c.winning_keywords?.length > 0 ? (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Winning keywords</div>
                  <div className="flex flex-wrap gap-1">
                    {c.winning_keywords.slice(0, 10).map((k, i) => (
                      <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-accent2/10 text-accent2 border border-accent2/20">{k}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-gray-500 italic">
                  {c.ready ? "No standout keywords yet." : "Publish a few more videos here — learning kicks in once it has enough results."}
                </div>
              )}

              {c.top_titles?.length > 0 && (
                <div className="mt-3 pt-2 border-t border-border/60">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Top performers</div>
                  <ul className="space-y-0.5">
                    {c.top_titles.slice(0, 3).map((t, i) => (
                      <li key={i} className="text-[11px] text-gray-400 truncate" title={t}>• {t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>
      )}
    </div>
  );
}
