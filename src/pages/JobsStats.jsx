import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ArrowLeft, BarChart3, Star, CheckCircle2, XCircle, StopCircle } from "lucide-react";
import { api } from "../api/client";

/**
 * Phase 14 / V2 Beta (D-13.12, user-facing).
 *
 * Aggregate dashboard for the calling user's V2 jobs only. Read-only;
 * the heavy lifting is server-side at /api/v2/stats/.
 */
export default function JobsStats() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    let cancelled = false;
    api.getV2UserStats()
      .then((s) => { if (!cancelled) setStats(s); })
      .catch((e) => { if (!cancelled) setError(e.message || "Failed to load stats"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-600">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/app" className="btn btn-secondary py-1.5 px-2.5 flex items-center gap-1">
          <ArrowLeft size={14} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 size={18} className="text-accent2" />
            V2 Beta stats
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Aggregates for your own V2 jobs only.
          </p>
        </div>
      </div>

      {error && (
        <div className="card p-3 mb-4 text-sm text-red-300">{error}</div>
      )}

      {stats && stats.total_v2_jobs === 0 && (
        <div className="card p-8 text-center">
          <p className="text-gray-400 mb-3">
            No V2 Beta jobs yet.
          </p>
          <Link to="/new" className="btn btn-primary inline-flex items-center gap-2">
            Submit your first V2 job
          </Link>
        </div>
      )}

      {stats && stats.total_v2_jobs > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard
              label="Total"
              value={stats.total_v2_jobs}
              accent="text-white"
            />
            <StatCard
              label="Completed"
              value={stats.completed_count}
              icon={<CheckCircle2 size={14} />}
              accent="text-green-300"
            />
            <StatCard
              label="Failed"
              value={stats.failed_count}
              icon={<XCircle size={14} />}
              accent="text-red-300"
            />
            <StatCard
              label="Cancelled"
              value={stats.cancelled_count}
              icon={<StopCircle size={14} />}
              accent="text-amber-300"
            />
          </div>

          <div className="card p-4 sm:p-5 mb-4">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-3xl font-bold text-white tabular-nums">
                {stats.success_rate_pct}%
              </span>
              <span className="text-sm text-gray-500">success rate</span>
            </div>
            <p className="text-[12px] text-gray-500">
              {stats.completed_count} of {stats.total_v2_jobs} jobs completed without
              cancellation or failure.
            </p>
          </div>

          <div className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <Star size={14} className="text-amber-400" /> Average rating
            </h2>
            {stats.rating_count > 0 ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-white tabular-nums">
                    {stats.average_rating}
                  </span>
                  <span className="text-sm text-gray-500">/ 100</span>
                  <span className="text-[12px] text-gray-500 ml-2">
                    ({stats.rating_count} rating{stats.rating_count === 1 ? "" : "s"})
                  </span>
                </div>
                <p className="text-[12px] text-gray-500 mt-1">
                  Average across the V2 jobs you've rated.
                </p>
              </>
            ) : (
              <p className="text-[13px] text-gray-500">
                You haven't rated any completed V2 jobs yet. Open a completed
                V2 job and use the "Rate this job" panel to leave feedback.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}


function StatCard({ label, value, icon, accent = "text-white" }) {
  return (
    <div className="card p-3.5">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1
                      flex items-center gap-1">
        {icon} {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}
