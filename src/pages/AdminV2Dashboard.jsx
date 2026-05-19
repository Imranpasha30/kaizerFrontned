import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Loader2, RefreshCw, Star, MessageSquare, BarChart3, AlertTriangle,
  StopCircle, ChevronLeft, ChevronRight, ExternalLink,
} from "lucide-react";
import { adminApi } from "../api/client";
import Button from "../components/ui/Button";
import {
  Page, PageHeader, DashCard, KpiTile, ErrorBanner, Chip, SectionTitle,
  DataTable, EmptySlot,
} from "./admin/_primitives";

/**
 * Phase 14 / V2 Beta — admin dashboard (D-13.8 + D-13.12 admin-facing).
 *
 * Mounted at /admin/v2 via the TABS array in Admin.jsx. Two sections:
 *   • Stats card grid — health KPIs + failure-by-slug + rating dist
 *   • Feedback table  — paginated list joined with job + user
 *
 * Failure-by-slug is the most operationally useful breakdown (per the
 * decision-surface note) — it sits prominently above the rating table.
 */

const PAGE_SIZE = 50;

export default function AdminV2Dashboard() {
  const [stats,    setStats]    = useState(null);
  const [feedback, setFeedback] = useState({ total: 0, items: [], offset: 0, limit: PAGE_SIZE });
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [offset,   setOffset]   = useState(0);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, f] = await Promise.all([
        adminApi.v2Stats(),
        adminApi.v2Feedback(PAGE_SIZE, offset),
      ]);
      setStats(s);
      setFeedback(f);
    } catch (e) {
      setError(e.message || "Failed to load V2 admin data");
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => { loadAll(); }, [loadAll]);

  return (
    <Page>
      <PageHeader
        eyebrow="V2 BETA"
        title="V2 Beta health"
        subtitle="Failure-by-slug + rating distribution + global counts"
        accent="violet"
        actions={(
          <Button
            variant="ghost"
            size="sm"
            leftIcon={loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            onClick={loadAll}
            disabled={loading}
          >
            Refresh
          </Button>
        )}
      />

      {error && <ErrorBanner error={error} />}

      <StatsBlock stats={stats} loading={loading} />

      <SectionTitle icon={MessageSquare}>Recent feedback</SectionTitle>
      <FeedbackTable
        feedback={feedback}
        loading={loading}
        offset={offset}
        onOffsetChange={setOffset}
      />
    </Page>
  );
}


function StatsBlock({ stats, loading }) {
  if (loading && !stats) {
    return (
      <DashCard>
        <div className="flex items-center justify-center py-8 text-[var(--adm-text-4)]">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </DashCard>
    );
  }
  if (!stats) return null;

  const sb = stats.status_breakdown || {};
  const fb = stats.failure_breakdown_by_slug || {};
  const rd = stats.rating_distribution || {};

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <KpiTile tone=""     label="Total V2 jobs"   value={stats.total_v2_jobs_all_users} icon={BarChart3} />
        <KpiTile tone="emerald" label="Completed"    value={sb.done || 0} />
        <KpiTile tone="rose"    label="Failed"       value={sb.failed || 0} />
        <KpiTile tone="amber"   label="Cancelled"    value={sb.cancelled || 0} sub={`${stats.cancellation_rate_pct}% rate`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
        <DashCard title="Failure breakdown by slug" icon={AlertTriangle}>
          {Object.keys(fb).length === 0 ? (
            <EmptySlot text="No failures yet" />
          ) : (
            <DataTable headers={["Slug", "Count"]}>
              {Object.entries(fb)
                .sort((a, b) => b[1] - a[1])
                .map(([slug, count]) => (
                  <tr key={slug}>
                    <td><Chip tone={slugTone(slug)}>{slug}</Chip></td>
                    <td className="text-right font-mono">{count}</td>
                  </tr>
                ))}
            </DataTable>
          )}
        </DashCard>

        <DashCard title="Rating distribution" icon={Star}>
          {stats.rating_count === 0 ? (
            <EmptySlot text="No ratings yet" />
          ) : (
            <>
              <div className="mb-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white tabular-nums">
                  {stats.average_rating_all_users ?? "—"}
                </span>
                <span className="text-xs text-[var(--adm-text-4)]">
                  / 100 average · {stats.rating_count} rating{stats.rating_count === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {["0-20", "21-40", "41-60", "61-80", "81-100"].map((bucket) => {
                  const count = rd[bucket] || 0;
                  const pct = stats.rating_count ? (count / stats.rating_count) * 100 : 0;
                  return (
                    <div key={bucket} className="flex items-center gap-2 text-xs">
                      <span className="w-14 text-[var(--adm-text-4)]">{bucket}</span>
                      <div className="flex-1 h-2 rounded-full bg-black/40 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: bucket === "0-20" || bucket === "21-40"
                              ? "rgba(248,113,113,0.6)"
                              : bucket === "41-60"
                              ? "rgba(251,191,36,0.6)"
                              : "rgba(74,222,128,0.6)",
                          }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono tabular-nums">{count}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </DashCard>
      </div>
    </>
  );
}


function FeedbackTable({ feedback, loading, offset, onOffsetChange }) {
  const items = feedback?.items || [];
  const total = feedback?.total || 0;
  const limit = feedback?.limit || PAGE_SIZE;
  const pageEnd = Math.min(offset + limit, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  if (loading && items.length === 0) {
    return (
      <DashCard>
        <div className="flex items-center justify-center py-8 text-[var(--adm-text-4)]">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </DashCard>
    );
  }

  if (total === 0) {
    return (
      <DashCard>
        <EmptySlot text="No V2 feedback submitted yet" />
      </DashCard>
    );
  }

  return (
    <DashCard
      footer={(
        <div className="flex items-center justify-between">
          <span>
            {offset + 1}–{pageEnd} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={!canPrev}
              onClick={() => onOffsetChange(Math.max(0, offset - limit))}
              leftIcon={<ChevronLeft size={12} />}
            >
              Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canNext}
              onClick={() => onOffsetChange(offset + limit)}
              leftIcon={<ChevronRight size={12} />}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    >
      <DataTable headers={["Rating", "Comment", "Job", "User", "When"]}>
        {items.map((it) => (
          <tr key={it.id}>
            <td>
              <span className={`font-mono tabular-nums font-bold ${ratingColor(it.rating)}`}>
                {it.rating}
              </span>
              <span className="text-[var(--adm-text-5)] text-[11px] ml-1">/100</span>
            </td>
            <td className="max-w-[280px]">
              {it.comment
                ? <span className="text-[var(--adm-text-2)] whitespace-pre-wrap break-words">{it.comment}</span>
                : <span className="text-[var(--adm-text-5)] italic">no comment</span>}
            </td>
            <td>
              <Link
                to={`/jobs/${it.job.id}`}
                className="inline-flex items-center gap-1 text-[var(--adm-cyan)] hover:underline"
              >
                {it.job.name || it.job.video_name || `Job #${it.job.id}`}
                <ExternalLink size={11} className="opacity-60" />
              </Link>
              <div className="text-[10px] text-[var(--adm-text-5)] mt-0.5">
                <Chip tone={jobStatusTone(it.job.status)}>{it.job.status}</Chip>
              </div>
            </td>
            <td className="text-xs">
              {it.user?.email || <span className="text-[var(--adm-text-5)]">deleted</span>}
            </td>
            <td className="text-[var(--adm-text-4)] text-xs whitespace-nowrap">
              {relTime(it.submitted_at)}
            </td>
          </tr>
        ))}
      </DataTable>
    </DashCard>
  );
}


// ── helpers ──────────────────────────────────────────────────────────

function ratingColor(r) {
  if (r >= 81) return "text-green-300";
  if (r >= 61) return "text-emerald-300";
  if (r >= 41) return "text-amber-300";
  if (r >= 21) return "text-orange-300";
  return "text-red-300";
}

function slugTone(slug) {
  if (slug === "cancelled") return "amber";
  if (slug.startsWith("permanent_")) return "rose";
  return "rose";
}

function jobStatusTone(status) {
  switch (status) {
    case "done":      return "emerald";
    case "failed":    return "rose";
    case "cancelled": return "amber";
    case "running":   return "cyan";
    default:          return "default";
  }
}

function relTime(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Math.round((Date.now() - t) / 1000);
  if (diff < 5)     return "just now";
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 2) return "yesterday";
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
