/* What is broadcasting right now, who started it, and what went wrong.
 *
 * Before this tab the operator had no admin view of Live Studio at all --
 * routers/admin.py never touched live_streams, and the one broadcast rollup it
 * did have (/admin/rtmp/activity) reads UploadJob rows from a different agent
 * on a different code path.
 *
 * WHAT THIS IS CAREFUL ABOUT:
 *
 * "Live now" is deliberately NOT windowed. A broadcast started five days ago
 * can still be running, so filtering it by the date range would hide exactly
 * the row an operator opens this page to find.
 *
 * Failures are shown beside successes, not tucked away. Two thirds of this
 * platform's broadcasts have failed at some point; a dashboard that only
 * counted the good ones would have hidden the yt-dlp outage for a week.
 *
 * A URL-sourced broadcast and an uploaded one fail in completely different
 * ways -- one through yt-dlp, one through the upload path -- so the source is
 * on every row rather than buried in a detail view.
 *
 * Built from the admin primitives so it sits beside the other tabs rather
 * than looking bolted on.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Radio, RefreshCw, ExternalLink, AlertTriangle, Users, Tv,
  CheckCircle2, XCircle, Clock, Activity, Gauge, Server
} from "lucide-react";
import { adminApi } from "../../api/client";
import {
  Page, PageHeader, KpiTile, DashCard, DataTable, Chip, ErrorBanner, EmptySlot,
  RangeTabs,
} from "./_primitives";

/* The eight non-terminal statuses plus the three terminal ones. Taken from
 * what the orchestrator actually writes -- the LiveStream docstring lists
 * five and is stale, and a tab built on that would show blanks for the rest. */
const TONE = {
  streaming:    "emerald",
  queued:       "amber",
  uploading:    "amber",
  uploaded:     "amber",
  downloading:  "amber",
  branding:     "amber",
  starting:     "amber",
  provisioning: "amber",
  done:         "cyan",
  failed:       "rose",
  canceled:     "default",
};

const LABEL = {
  provisioning: "minting",
  uploaded:     "uploaded",
  downloading:  "fetching",
};

function StatusChip({ status }) {
  const s = (status || "").toLowerCase();
  return <Chip tone={TONE[s] || "default"}>{LABEL[s] || s || "unknown"}</Chip>;
}

function fmtWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function fmtDur(seconds) {
  if (seconds == null) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/* How long something has been running, from its start to now. The row has no
 * finished_at yet, so duration_s is null and fmtDur would show a dash on the
 * one thing the operator most wants a number for. */
function fmtRunning(startedIso) {
  if (!startedIso) return "—";
  const t = new Date(startedIso).getTime();
  if (Number.isNaN(t)) return "—";
  return fmtDur((Date.now() - t) / 1000);
}

/* Events the engine emits. Only the ones an operator should react to get a
   colour; the rest stay neutral so the coloured ones mean something. */
const EVENT_TONE = {
  channel_started: "emerald",
  video_ended: "cyan",
  channel_end_pending: "amber",
  channel_end_abandoned: "rose",
  channel_failed: "rose",
  channel_queued: "amber",
  worker_lost: "rose",
};

/* Used / reserved / free, drawn to one scale.
 *
 * The RESERVE is the part worth showing and the part no other screen has: 50
 * units are set aside for every broadcast currently open, so it can always be
 * ended. New starts may only spend what is left after it — which is why
 * "starts left" can be zero while the bar looks half empty. */
function CreditBar({ credit }) {
  if (!credit) return <EmptySlot text="No credit data." />;
  const limit = Math.max(1, credit.limit || 1);
  const used = credit.used || 0;
  const reserve = credit.reserve || 0;
  const pctUsed = Math.min(100, (used / limit) * 100);
  const pctRes = Math.min(100 - pctUsed, (reserve / limit) * 100);
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded"
           style={{ background: "var(--adm-bg-elev)" }}
           title={`${used} used, ${reserve} reserved to close open broadcasts`}>
        <div style={{ width: `${pctUsed}%`, background: "var(--adm-cyan)" }} />
        <div style={{ width: `${pctRes}%`, background: "var(--adm-muted)", opacity: 0.55 }} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-[12px]">
        <div><div className="opacity-60">Used</div>
             <div className="tabular-nums text-[15px]">{used} / {limit}</div></div>
        <div><div className="opacity-60">Reserved to close</div>
             <div className="tabular-nums text-[15px]">{reserve}</div>
             <div className="opacity-60">{credit.open_connected_broadcasts} open</div></div>
        <div><div className="opacity-60">Free for new starts</div>
             <div className="tabular-nums text-[15px]">{credit.free_for_starts}</div></div>
        <div><div className="opacity-60">Connected starts left</div>
             <div className="tabular-nums text-[15px]"
                  style={credit.connected_starts_left === 0
                            ? { color: "var(--adm-danger)" } : undefined}>
               {credit.connected_starts_left}
             </div>
             <div className="opacity-60">
               {credit.start_cost} + {credit.close_cost} each
             </div></div>
      </div>
      <div className="text-[11px] opacity-60">
        Resets {credit.resets_at ? new Date(credit.resets_at).toLocaleString() : "at midnight Pacific"}
      </div>
    </div>
  );
}


export default function AdminLiveActivity() {
  const [data, setData]     = useState(null);
  const [engine, setEngine] = useState(null);
  const [proof, setProof]   = useState(null);
  const [days, setDays]   = useState(7);
  const [error, setError] = useState(null);
  const [busy, setBusy]   = useState(false);
  const daysRef = useRef(days);
  daysRef.current = days;

  const load = useCallback(async (showBusy = false) => {
    if (showBusy) setBusy(true);
    try {
      const r = await adminApi.liveBroadcasts(daysRef.current);
      setData(r);
      setError(null);
    } catch (e) {
      setError(e?.message || "Could not load live activity");
    } finally {
      if (showBusy) setBusy(false);
    }
    /* The engine is optional. Its route does not exist when
       KAIZER_LIVE_ENGINE is unset, and that is a normal state, not a
       failure — so this never sets the error banner. */
    try {
      setEngine(await adminApi.liveEngineOverview(40));
    } catch {
      setEngine(null);
    }
    /* Measured spend. Independent of the engine — youtube_api_calls is
       written by the classic path too, so this is worth showing either way. */
    try {
      setProof(await adminApi.liveCreditProof(24));
    } catch {
      setProof(null);
    }
  }, []);

  useEffect(() => { load(true); }, [load, days]);

  /* Poll while the tab is visible. Broadcasts change state on the order of
   * seconds, and an operator watching a launch wants it to move without
   * reaching for refresh. Paused when the tab is hidden so a forgotten
   * window does not poll the admin API all night. */
  useEffect(() => {
    let timer = null;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (!document.hidden) { try { await load(false); } catch { /* reported inline */ } }
      if (!stopped) timer = setTimeout(tick, 8000);
    };
    timer = setTimeout(tick, 8000);
    const onVis = () => { if (!document.hidden) load(false); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  const t        = data?.totals || {};
  const liveNow  = data?.live_now || [];
  const recent   = data?.recent || [];
  const byUser   = data?.by_user || [];
  const byChan   = data?.by_channel || [];
  const rate     = t.success_rate == null ? null : `${Math.round(t.success_rate * 100)}%`;

  return (
    <Page>
      <PageHeader
        eyebrow="Live Studio"
        title="Live activity"
        subtitle="Every broadcast across every account — what is on air now, what finished, and what failed."
        accent="violet"
        actions={
          <div className="flex items-center gap-2">
            <RangeTabs
              value={days}
              onChange={setDays}
              options={[{ value: 1, label: "24h" }, { value: 7, label: "7d" },
                        { value: 30, label: "30d" }, { value: 90, label: "90d" }]}
            />
            <button
              type="button"
              onClick={() => load(true)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium border border-[color:var(--adm-border)] hover:border-[color:var(--adm-border-hover)] disabled:opacity-50"
              title="Refresh now"
            >
              <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        }
      />

      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

      {/* Live now leads, because it is the only number that is about right
          now rather than about history. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <KpiTile
          tone={liveNow.length ? "emerald" : "indigo"}
          icon={Radio}
          label="On air now"
          value={liveNow.length}
          sub={liveNow.length ? "broadcasting" : "nothing streaming"}
        />
        <KpiTile icon={Activity} label={`Broadcasts (${days}d)`} value={t.total ?? "—"} />
        <KpiTile tone="emerald" icon={CheckCircle2} label="Finished cleanly" value={t.done ?? "—"} />
        <KpiTile tone="rose" icon={XCircle} label="Failed" value={t.failed ?? "—"} />
        <KpiTile
          tone={t.success_rate != null && t.success_rate < 0.7 ? "amber" : "violet"}
          icon={CheckCircle2}
          label="Success rate"
          value={rate ?? "—"}
          sub="of finished broadcasts"
        />
      </div>

      {/* ── Live engine v2 ─────────────────────────────────────────
          Only when it is running. The credit bar is the point: it is the
          only place the RESERVE is visible, and the reserve is what
          guarantees an open broadcast can always be closed. */}
      {engine && (
        <>
          <DashCard title="API credit today" icon={Gauge}>
            <CreditBar credit={engine.credit} />
          </DashCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashCard title="Stream workers" icon={Server}>
              {(engine.workers || []).length === 0 ? (
                <EmptySlot text="No worker is running. Nothing can go live." />
              ) : (
                <DataTable headers={["Worker", "Host", "Videos", "Slots free"]}>
                  {engine.workers.map((w) => (
                    <tr key={w.id}>
                      <td className="whitespace-nowrap">{w.id}</td>
                      <td className="whitespace-nowrap opacity-70">{w.host}</td>
                      <td className="tabular-nums">{w.videos ?? "—"}</td>
                      <td className="tabular-nums">{w.free ?? w.slots ?? "—"}</td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </DashCard>

            <DashCard title="Videos on air" icon={Radio}>
              {(engine.live_videos || []).length === 0 ? (
                <EmptySlot text="Nothing is streaming." />
              ) : (
                <DataTable headers={["Video", "Channels", "Connected", "Manual", "Queued", "Unhealthy"]}>
                  {engine.live_videos.map((v) => (
                    <tr key={v.video_id}>
                      <td className="whitespace-nowrap font-mono text-[11px]">{v.video_id}</td>
                      <td className="tabular-nums">{v.channels_on}</td>
                      <td className="tabular-nums">{v.connected}</td>
                      <td className="tabular-nums">{v.manual}</td>
                      <td className="tabular-nums">{v.queued || 0}</td>
                      <td className="tabular-nums">
                        {v.unhealthy > 0
                          ? <span style={{ color: "var(--adm-danger)" }}>{v.unhealthy}</span>
                          : 0}
                      </td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </DashCard>
          </div>

          <DashCard title="Engine events" icon={Activity}>
            {(engine.events || []).length === 0 ? (
              <EmptySlot text="No events yet." />
            ) : (
              <DataTable headers={["When", "Event", "Video", "Channel", "Detail"]}>
                {engine.events.slice(0, 40).map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap opacity-70">
                      {e.ts ? new Date(Number(e.ts) * 1000).toLocaleTimeString() : "—"}
                    </td>
                    <td><Chip tone={EVENT_TONE[e.type] || "default"}>{e.type}</Chip></td>
                    <td className="font-mono text-[11px]">{e.video_id || "—"}</td>
                    <td className="font-mono text-[11px]">{e.channel_id || "—"}</td>
                    <td className="max-w-[36ch] break-words opacity-80">
                      {e.error || e.reason || e.mode || ""}
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </DashCard>
        </>
      )}

      {/* ── Does manual mode really cost nothing? ──────────────────
          Measured, not claimed. Every API call this backend makes is
          recorded with its published unit cost, so this is the ledger
          rather than an estimate. A manual broadcast showing any calls
          at all would mean the feature is not doing what it says. */}
      {proof && (
        <DashCard title="What going live actually cost" icon={Gauge}>
          <div className="space-y-3">
            <p className="text-[12.5px] opacity-80 max-w-[74ch]">{proof.verdict}</p>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-[12px]">
              <div>
                <div className="opacity-60">Manual broadcasts</div>
                <div className="tabular-nums text-[15px]">
                  {proof.engine_started?.manual ?? "—"}
                </div>
                <div className="opacity-60">0 units each</div>
              </div>
              <div>
                <div className="opacity-60">API broadcasts</div>
                <div className="tabular-nums text-[15px]">
                  {proof.connected?.broadcasts_with_api_calls ?? 0}
                </div>
                <div className="opacity-60">{proof.connected?.units ?? 0} units total</div>
              </div>
              <div>
                <div className="opacity-60">Units per API broadcast</div>
                <div className="tabular-nums text-[15px]">
                  {proof.connected?.units_per_broadcast ?? "—"}
                </div>
                <div className="opacity-60">
                  expected {proof.connected?.expected_per_broadcast}
                </div>
              </div>
              <div>
                <div className="opacity-60">All operations, 24h</div>
                <div className="tabular-nums text-[15px]">
                  {proof.total_units_all_operations}
                </div>
                <div className="opacity-60">uploads included</div>
              </div>
            </div>

            {(proof.by_operation || []).length > 0 && (
              <DataTable headers={["Operation", "Calls", "Units"]}>
                {proof.by_operation.slice(0, 12).map((o) => (
                  <tr key={o.operation}>
                    <td className="font-mono text-[11px]">{o.operation}</td>
                    <td className="tabular-nums">{o.calls}</td>
                    <td className="tabular-nums">{o.units}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </div>
        </DashCard>
      )}

      {/* ── On air ─────────────────────────────────────────────────── */}
      <DashCard title="On air now" icon={Radio}>
        {liveNow.length === 0 ? (
          <EmptySlot text="No broadcast is running right now." />
        ) : (
          <DataTable headers={["Channel", "User", "Title", "Source", "Status", "Running", "Progress", "Watch"]}>
            {liveNow.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{r.channel_name || `#${r.channel_id}`}</td>
                <td className="whitespace-nowrap opacity-70">{r.user_email || `user ${r.user_id}`}</td>
                <td className="max-w-[22ch] truncate" title={r.title || ""}>{r.title || "—"}</td>
                <td><Chip tone={r.source === "url" ? "violet" : "default"}>{r.source}</Chip></td>
                <td><StatusChip status={r.status} /></td>
                <td className="whitespace-nowrap tabular-nums">{fmtRunning(r.started_at)}</td>
                <td className="whitespace-nowrap tabular-nums">
                  {r.progress_pct == null ? "—" : `${r.progress_pct}%`}
                </td>
                <td>
                  {r.watch_url ? (
                    <a href={r.watch_url} target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1 text-[12.5px] hover:underline">
                      open <ExternalLink size={11} />
                    </a>
                  ) : <span className="opacity-70">—</span>}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </DashCard>

      {/* ── Recent, successes and failures together ────────────────── */}
      <DashCard
        title={`Recent broadcasts — last ${days} day${days === 1 ? "" : "s"}`}
        icon={Clock}
      >
        {recent.length === 0 ? (
          <EmptySlot text="No broadcasts in this window." />
        ) : (
          <DataTable headers={["When", "Channel", "User", "Source", "Status", "Ran for", "Result"]}>
            {recent.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap opacity-70">{fmtWhen(r.created_at)}</td>
                <td className="whitespace-nowrap">{r.channel_name || `#${r.channel_id}`}</td>
                <td className="whitespace-nowrap opacity-70">{r.user_email || `user ${r.user_id}`}</td>
                <td><Chip tone={r.source === "url" ? "violet" : "default"}>{r.source}</Chip></td>
                <td><StatusChip status={r.status} /></td>
                <td className="whitespace-nowrap tabular-nums">{fmtDur(r.duration_s)}</td>
                <td className="max-w-[40ch]">
                  {r.status === "failed" ? (
                    <span className="inline-flex items-start gap-1.5">
                      <AlertTriangle size={12} className="mt-0.5 flex-shrink-0"
                                     style={{ color: "var(--adm-danger)" }} />
                      <span className="break-words" title={r.error || ""}>
                        {r.error || r.message || "failed, no reason recorded"}
                      </span>
                    </span>
                  ) : r.watch_url ? (
                    <a href={r.watch_url} target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1 text-[12.5px] hover:underline break-all">
                      {r.watch_url.replace("https://www.youtube.com/", "")}
                      <ExternalLink size={11} className="flex-shrink-0" />
                    </a>
                  ) : (
                    <span className="opacity-70">{r.message || "—"}</span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </DashCard>

      {/* ── Who and where ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashCard title="By user" icon={Users}>
          {byUser.length === 0 ? <EmptySlot text="No activity." /> : (
            <DataTable headers={["User", "Total", "Done", "Failed"]}>
              {byUser.map((u) => (
                <tr key={u.user_id ?? "none"}>
                  <td className="whitespace-nowrap">{u.email || `user ${u.user_id}`}</td>
                  <td className="tabular-nums">{u.total}</td>
                  <td className="tabular-nums">{u.done}</td>
                  <td className="tabular-nums">
                    {u.failed > 0 ? <span style={{ color: "var(--adm-danger)" }}>{u.failed}</span> : u.failed}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </DashCard>

        <DashCard title="By channel" icon={Tv}>
          {byChan.length === 0 ? <EmptySlot text="No activity." /> : (
            <DataTable headers={["Channel", "Total", "Done", "Failed"]}>
              {byChan.map((c) => (
                <tr key={c.channel_id ?? "none"}>
                  <td className="whitespace-nowrap">{c.name || `#${c.channel_id}`}</td>
                  <td className="tabular-nums">{c.total}</td>
                  <td className="tabular-nums">{c.done}</td>
                  <td className="tabular-nums">
                    {c.failed > 0 ? <span style={{ color: "var(--adm-danger)" }}>{c.failed}</span> : c.failed}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </DashCard>
      </div>
    </Page>
  );
}
