import React, { useEffect, useMemo, useState } from "react";
import {
  CreditCard, CheckCircle2, Loader2, AlertCircle, Sparkles,
  Zap, Crown, Rocket, Info,
} from "lucide-react";
import { api } from "../api/client";

const TIER_ICON = {
  free:    Sparkles,
  creator: Zap,
  pro:     Rocket,
  agency:  Crown,
};

const TIER_ACCENT = {
  free:    "border-gray-700 bg-[#0c0c0c]",
  creator: "border-accent2/40 bg-accent2/5",
  pro:     "border-accent/40 bg-accent/5",
  agency:  "border-yellow-600/40 bg-yellow-900/10",
};

function fmtLimit(v) {
  if (v == null) return "—";
  if (v === -1) return "Unlimited";
  return String(v);
}

function UsageBar({ used, limit, unit = "" }) {
  if (limit === -1) {
    return (
      <div className="text-[11px] text-gray-400">
        <span className="text-green-400">{used}</span>
        {unit && ` ${unit}`} · unlimited
      </div>
    );
  }
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-accent2";
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-gray-300 tabular-nums">
          <span className="text-white font-medium">{used}</span> / {limit} {unit}
        </span>
        <span className={`tabular-nums ${pct >= 90 ? "text-red-400" : "text-gray-500"}`}>
          {Math.round(pct)}%
        </span>
      </div>
      <div className="h-1.5 bg-black/40 rounded overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Billing() {
  const [plans, setPlans] = useState(null);
  const [mine, setMine]   = useState(null);
  const [cycle, setCycle] = useState("monthly");   // monthly | yearly
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [busy, setBusy]           = useState("");  // plan_key being checked-out
  const [notice, setNotice]       = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [plansRes, meRes] = await Promise.all([
        api.listPlans(),
        api.getMyBilling(),
      ]);
      setPlans(plansRes);
      setMine(meRes);
    } catch (e) {
      setError(e.message || "Failed to load billing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleUpgrade(planKey) {
    if (!planKey || planKey === "free") return;
    setBusy(planKey);
    setError("");
    setNotice("");
    try {
      const res = await api.createCheckout(planKey, cycle);
      if (res?.url) {
        window.location.href = res.url;
      } else {
        setError("Unexpected checkout response — no redirect URL.");
      }
    } catch (e) {
      // 501 with code=billing_not_configured → show friendly coming-soon notice
      const msg = e.message || "";
      if (msg.includes("billing_not_configured") || msg.includes("501") || msg.includes("not configured") || msg.includes("activation pending")) {
        setNotice(
          "💳 Paid plans go live once the platform owner activates Stripe. "
          + "You can continue using the Starter tier in the meantime — no disruption."
        );
      } else {
        setError(msg || "Upgrade failed");
      }
    } finally {
      setBusy("");
    }
  }

  async function handleDevSwitch(planKey) {
    if (!confirm(`Dev-switch your plan to "${planKey}"?  (Admin-only — no real payment.)`)) return;
    try {
      await api.devSetPlan(planKey);
      await load();
      setNotice(`Plan switched to ${planKey} (dev).`);
    } catch (e) {
      setError(e.message || "Dev switch failed");
    }
  }

  const tierList = plans?.plans || [];
  const currentKey = mine?.plan?.key || "free";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-white flex items-center gap-2">
          <CreditCard size={18} className="text-accent2" /> Billing & Plans
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Pick a plan that matches how many clips you publish a month.  Every tier includes the full Content+Brand Overlay SEO engine — higher tiers unlock more quota and advanced features.
        </p>
      </header>

      {error && (
        <div className="bg-red-950/50 border border-red-900 text-red-300 px-3 py-2 rounded text-sm mb-4 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div className="bg-blue-950/40 border border-blue-900 text-blue-200 px-3 py-2 rounded text-sm mb-4 flex items-start gap-2">
          <Info size={14} className="mt-0.5 flex-shrink-0" /> <span>{notice}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
          <Loader2 size={16} className="animate-spin" /> Loading billing…
        </div>
      ) : (
        <>
          {/* Current plan + usage snapshot */}
          {mine && (
            <section className="mb-8">
              <div className="bg-[#0c0c0c] border border-accent2/40 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-accent2 mb-1">Your plan</div>
                    <h2 className="text-lg font-semibold text-white">
                      {mine.plan.name}
                      {mine.plan.price_monthly > 0 && (
                        <span className="ml-2 text-sm text-gray-400 font-normal">
                          ${mine.plan.cycle === "yearly" ? mine.plan.price_yearly : mine.plan.price_monthly}
                          /{mine.plan.cycle === "yearly" ? "yr" : "mo"}
                        </span>
                      )}
                    </h2>
                    {mine.renews_at && (
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Renews {new Date(mine.renews_at).toLocaleDateString()}
                      </div>
                    )}
                    {!mine.stripe_connected && mine.plan.key !== "free" && (
                      <div className="text-[11px] text-yellow-400 mt-1">
                        ⓘ Stripe not yet activated — you're on this plan via manual override.
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {/* Admin-only dev-switch buttons for testing */}
                    <details className="text-[11px] text-gray-500">
                      <summary className="cursor-pointer hover:text-gray-300">dev</summary>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {["free","creator","pro","agency"].map((k) => (
                          <button key={k} onClick={() => handleDevSwitch(k)}
                                  className="px-2 py-0.5 rounded bg-black/40 border border-border hover:border-accent2 text-[10px]">
                            {k}
                          </button>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>

                {/* Usage grid */}
                <div className="grid sm:grid-cols-2 gap-4 mt-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                      Clips this month
                    </div>
                    <UsageBar
                      used={mine.usage.clips_used}
                      limit={mine.usage.clips_limit}
                      unit="clips"
                    />
                    {mine.usage.reset_at && (
                      <div className="text-[10px] text-gray-600 mt-1">
                        Resets {new Date(mine.usage.reset_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                      Connected YouTube accounts
                    </div>
                    <UsageBar
                      used={mine.usage.yt_accounts_used}
                      limit={mine.usage.yt_accounts_limit}
                      unit="accounts"
                    />
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Monthly ↔ Yearly toggle */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <button
              onClick={() => setCycle("monthly")}
              className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                cycle === "monthly"
                  ? "bg-accent2/30 border-accent2 text-white"
                  : "bg-black/30 border-border text-gray-400 hover:text-gray-200"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCycle("yearly")}
              className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                cycle === "yearly"
                  ? "bg-accent2/30 border-accent2 text-white"
                  : "bg-black/30 border-border text-gray-400 hover:text-gray-200"
              }`}
            >
              Yearly
              <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-green-700/30 text-green-300">
                Save {plans?.current_discount_yearly_pct || 17}%
              </span>
            </button>
          </div>

          {/* Tier cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
            {tierList.map((p) => {
              const Icon = TIER_ICON[p.key] || Sparkles;
              const isCurrent = p.key === currentKey;
              const price = cycle === "yearly" ? p.price_yearly : p.price_monthly;
              const priceSuffix = cycle === "yearly" ? "/yr" : "/mo";
              return (
                <div
                  key={p.key}
                  className={`rounded-lg border p-4 flex flex-col ${TIER_ACCENT[p.key] || "border-border"} ${
                    isCurrent ? "ring-2 ring-accent2/50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-accent2" />
                      <span className="text-sm font-semibold text-white">{p.name}</span>
                    </div>
                    {isCurrent && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-700/30 text-green-300 font-semibold uppercase tracking-wider">
                        current
                      </span>
                    )}
                  </div>
                  <div className="mb-3">
                    <span className="text-2xl font-bold text-white">
                      {p.price_monthly === 0 ? "Free" : `$${price}`}
                    </span>
                    {p.price_monthly > 0 && (
                      <span className="text-xs text-gray-500 ml-1">{priceSuffix}</span>
                    )}
                  </div>
                  <ul className="space-y-1 text-[11px] text-gray-300 flex-1 mb-3">
                    {p.highlights.map((line, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <CheckCircle2 size={11} className="text-green-500 mt-0.5 flex-shrink-0" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handleUpgrade(p.key)}
                    disabled={isCurrent || p.key === "free" || busy === p.key}
                    className={`w-full py-1.5 text-xs rounded font-medium transition-colors disabled:cursor-not-allowed ${
                      isCurrent
                        ? "bg-black/40 border border-border text-gray-500"
                        : p.key === "free"
                        ? "bg-black/40 border border-border text-gray-500"
                        : "bg-accent2 hover:bg-accent text-white disabled:opacity-50"
                    }`}
                  >
                    {busy === p.key
                      ? <><Loader2 size={12} className="animate-spin inline-block mr-1" /> Redirecting…</>
                      : isCurrent ? "Your current plan"
                      : p.key === "free" ? "Starter (default)"
                      : "Upgrade"}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Feature comparison */}
          <section className="mb-10">
            <h2 className="text-sm font-semibold text-gray-200 mb-3">Feature comparison</h2>
            <div className="overflow-x-auto bg-[#0c0c0c] border border-border rounded">
              <table className="w-full text-xs">
                <thead className="bg-black/50 text-[10px] uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="text-left px-3 py-2">Feature</th>
                    {tierList.map((p) => (
                      <th key={p.key} className={`px-3 py-2 text-center ${p.key === currentKey ? "text-accent2" : "text-gray-400"}`}>
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {[
                    ["Clips / month",        "clips_per_month",     (v) => fmtLimit(v)],
                    ["YouTube accounts",     "yt_accounts",          (v) => fmtLimit(v)],
                    ["Languages supported",  "languages",           (v) => String(v)],
                    ["Brand kits",           "brand_kits",          (v) => fmtLimit(v)],
                    ["Veo 3 video gen / mo", "veo_videos_monthly",  (v) => fmtLimit(v)],
                    ["Advanced AI SEO",      "advanced_seo",        (v) => v ? "✓" : "—"],
                    ["Campaigns",            "campaigns_enabled",   (v) => v ? "✓" : "—"],
                    ["Channel groups",       "channel_groups",      (v) => v ? "✓" : "—"],
                    ["Thumbnail A/B",        "thumb_ab",            (v) => v ? "✓" : "—"],
                    ["Analytics history",    "analytics_days",      (v) => v === -1 ? "Unlimited" : `${v} days`],
                    ["Team seats",           "team_seats",          (v) => String(v)],
                    ["Priority support",     "priority_support",    (v) => v ? "✓" : "—"],
                    ["BYOK (own YT quota)",  "byok",                (v) => v ? "✓" : "—"],
                  ].map(([label, key, fmt]) => (
                    <tr key={key} className="text-gray-300">
                      <td className="px-3 py-1.5 text-gray-400">{label}</td>
                      {tierList.map((p) => (
                        <td key={p.key} className="px-3 py-1.5 text-center tabular-nums">
                          {fmt(p[key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Business model explainer — deliberately plain-English so power
              users understand why the pricing is structured this way. */}
          <BusinessModelExplainer />
        </>
      )}
    </div>
  );
}


function BusinessModelExplainer() {
  return (
    <section className="bg-[#0a0a0a] border border-border rounded-lg p-4 text-xs text-gray-300 leading-relaxed">
      <h2 className="text-sm font-semibold text-gray-200 mb-2 flex items-center gap-2">
        <Info size={13} className="text-accent2" /> How Kaizer's pricing works
      </h2>
      <div className="space-y-3">
        <p>
          <strong className="text-gray-100">Kaizer is the full news-video pipeline</strong> — import raw footage, auto-generate branded clips in 9 languages, write ≥95/100 SEO with Google-grounded research, and fan out to every YouTube channel you own with one click.  Your subscription pays for the product + compute + shared YouTube upload quota managed by us.
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mt-2">
          <div className="bg-black/30 border border-border rounded p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-accent2 mb-1">What we pay for</div>
            <ul className="space-y-0.5 text-[11px] text-gray-400">
              <li>• Gemini API (SEO + video analysis + Veo 3)</li>
              <li>• YouTube Data API quota (shared pool, managed)</li>
              <li>• Hosting (Railway: backend, Postgres, storage, bandwidth)</li>
              <li>• Google News / Trends / Autocomplete (free but rate-limited)</li>
              <li>• Payment processing (Stripe 2.9% + 30¢)</li>
              <li>• Email + monitoring + support ops</li>
            </ul>
          </div>
          <div className="bg-black/30 border border-border rounded p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-accent2 mb-1">Why the tiers look like this</div>
            <ul className="space-y-0.5 text-[11px] text-gray-400">
              <li>• <strong>Starter free</strong> — lets you test before paying.</li>
              <li>• <strong>Creator $19</strong> — solo channel, 1-2 daily uploads.</li>
              <li>• <strong>Pro $49</strong> — multi-channel operator, 5-7 daily.</li>
              <li>• <strong>Agency $199</strong> — teams + unlimited + own YT quota (BYOK) for bulk.</li>
              <li>• <strong>Yearly discount</strong> funds infra reservations + gives you 2 months free.</li>
            </ul>
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-accent2 mb-1">A note on YouTube's upload quota</div>
          <p className="text-[11px] text-gray-400">
            Every YouTube upload costs 1,600 units out of a daily 10,000-unit pool that YouTube assigns to <em>us</em> as the app owner.  At Starter you share that pool with every other free user; at Pro we prioritize you in a larger extended-quota pool we applied for; at Agency you can also switch on BYOK (Bring Your Own Key) to use your own Google Cloud project's quota for unlimited scale.  This is why heavy uploaders need higher tiers even though the code is the same.
          </p>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-accent2 mb-1">Upgrades, downgrades, cancellations</div>
          <p className="text-[11px] text-gray-400">
            Upgrade anytime — the new tier is prorated and unlocks instantly.  Downgrade takes effect at the end of your current billing cycle (no refunds).  Cancel anytime from the same billing portal — nothing is deleted; your data stays accessible on Starter tier.
          </p>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-yellow-400 mb-1">⓵ Early access note</div>
          <p className="text-[11px] text-yellow-300/80">
            Kaizer is currently in pre-launch — paid plans will go live once the Stripe account is activated by the platform owner.  Until then, your current tier is managed manually (admin can flip it via the <code className="bg-black/40 px-1 rounded">dev</code> toggle above).  Your usage is tracked accurately throughout, so when billing goes live, your counters are already correct.
          </p>
        </div>
      </div>
    </section>
  );
}
