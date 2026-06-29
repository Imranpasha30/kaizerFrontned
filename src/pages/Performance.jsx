import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart, Loader2, AlertCircle, RefreshCw, ExternalLink,
  TrendingUp, Eye, ThumbsUp, MessageSquare, Youtube, Award, Activity,
  Search, Download, ArrowUpDown, Calendar, X, Layers, Zap, Trophy,
  Flame, BarChart3, ChevronRight, SlidersHorizontal,
} from "lucide-react";
import { api } from "../api/client";
import {
  AiCoachPanel, CompareChannelsPanel, MetricHelp, METRIC_HELP, cadenceLabel,
  RadialGauge, KpiRing, fmtN as fmtNAI,
} from "../components/AnalyticsAI";
import ComplianceNote, { NoteLink } from "../components/ComplianceNote";
import TrendFinderTab from "../components/TrendFinderTab";

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
          { k: "performance", label: "Performance" },
          { k: "trend", label: "Channel Doctor" },
          { k: "learning", label: "SEO Learning" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tab === t.k
                ? "border-accent2 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {t.label}
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
      ) : tab === "trend" ? (
        <TrendFinderTab ytChannels={ytChannels} initialGcid={selectedGcid || ""} />
      ) : tab === "learning" ? (
        <SeoLearningTab />
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
function SeoLearningTab() {
  const [data, setData]   = useState(null);
  const [busy, setBusy]   = useState(true);
  const [err, setErr]     = useState("");

  useEffect(() => {
    let alive = true;
    setBusy(true); setErr("");
    api.seoLearning()
      .then((d) => { if (alive) setData(d); })
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <Zap size={15} className="text-accent2" />
          <span><strong className="text-white">{learning}</strong> of {channels.length} channel{channels.length === 1 ? "" : "s"} actively learning</span>
        </div>
        {data?.note && <p className="text-[11px] text-gray-500 max-w-xl">{data.note}</p>}
      </div>

      {channels.length === 0 ? (
        <div className="bg-[#111] border border-border rounded p-6 text-center text-sm text-gray-500">
          No connected channels yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {channels.map((c) => (
            <div
              key={c.channel_id}
              className={`rounded-xl border p-4 bg-panel transition-colors ${
                c.ready ? "border-accent2/40" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Youtube size={14} className="text-red-400 flex-shrink-0" />
                  <span className="text-sm font-semibold text-white truncate">{c.channel_name || `Channel #${c.channel_id}`}</span>
                </div>
                <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                  c.ready ? "bg-emerald-500/20 text-emerald-300" : "bg-gray-700 text-gray-400"
                }`}>
                  {c.ready ? "learning" : "collecting"}
                </span>
              </div>

              <div className="flex items-center gap-3 text-[11px] text-gray-400 mb-3">
                <span className="inline-flex items-center gap-1" title="Signal used to rank what works">
                  {c.signal === "ctr" ? <Trophy size={11} className="text-yellow-400" /> : <Eye size={11} />}
                  {c.signal === "ctr" ? "CTR" : "views"}
                </span>
                <span>·</span>
                <span>{c.videos_sampled} video{c.videos_sampled === 1 ? "" : "s"} learnt from</span>
                {!c.ctr_unlocked && (
                  <span className="ml-auto text-[10px] text-gray-600" title="Re-approve this channel for analytics to unlock CTR">CTR locked</span>
                )}
              </div>

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
  );
}
