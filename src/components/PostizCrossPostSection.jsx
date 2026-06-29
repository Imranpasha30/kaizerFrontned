import React, { useEffect, useState } from "react";
import { Link as RLink } from "react-router-dom";
import { Loader2, AlertCircle, CheckCircle2, Send, Globe } from "lucide-react";
import { api } from "../api/client";

/**
 * Admin-only cross-post toggle for the publish flow.
 *
 * Renders a "Cross-post via Postiz" panel that lists every platform
 * the user has connected on the self-hosted Postiz instance
 * (Twitter / Instagram / LinkedIn / Threads / TikTok / Discord /
 * Bluesky / Mastodon / …). Each row has a checkbox to opt in.
 *
 * Surfacing rules:
 *   - Parent (PublishModal) checks `user.is_admin` and only mounts
 *     this component for admins. Non-admins never load this code.
 *   - On mount we hit /api/postiz/status; if that comes back
 *     enabled=false (no API key, unreachable, etc.) the panel
 *     renders a soft "Postiz not configured" notice and disables
 *     itself. No platforms leak.
 *
 * Submit flow:
 *   - PublishModal submits to YouTube first (existing path).
 *   - On success, if any Postiz integrations were ticked, this
 *     component fires POST /api/postiz/schedule with the ones
 *     selected + the public R2 URL the YouTube upload returned.
 *   - Failures here are non-fatal — the YouTube upload already
 *     succeeded, so we just show a toast + log on the work-monitor
 *     instead of unwinding the YouTube publish.
 *
 * Props:
 *   value      : { selectedIds: Set<string>, text: string }
 *   onChange   : (next) => void
 *   defaultText: pre-filled caption (use SEO title/desc).
 */
// Match a Postiz integration to one of our Channels/style-profiles by NAME
// (case-insensitive, trimmed). That channel is the BRAND SOURCE (logo /
// watermark / socials) for branded Postiz delivery. Returns the channel or
// undefined when there's no style profile for this Postiz channel.
export function matchChannelForIntegration(integration, channels) {
  const key = String(integration?.name || integration?.identifier || "")
    .trim().toLowerCase();
  if (!key) return undefined;
  return (channels || []).find(
    (c) => String(c?.name || "").trim().toLowerCase() === key
  );
}

export default function PostizCrossPostSection({ value, onChange, defaultText = "", channels = [] }) {
  const [status, setStatus] = useState(null);     // {enabled, reason?, providers, integration_count}
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [integrations, setIntegrations] = useState([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [error, setError] = useState("");

  // Initial probe — admin sees fast feedback whether Postiz is live.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await api.postizStatus();
        if (!alive) return;
        setStatus(s);
        if (s.enabled) {
          setLoadingIntegrations(true);
          const list = await api.postizIntegrations();
          if (!alive) return;
          setIntegrations(list || []);
          // Expose the full integration objects to the parent so it can
          // resolve names → channels at submit time (for branded routing).
          onChange({ ...value, integrations: list || [] });
        }
      } catch (e) {
        if (!alive) return;
        setStatus({ enabled: false, reason: e.message || "unreachable" });
      } finally {
        if (alive) { setLoadingStatus(false); setLoadingIntegrations(false); }
      }
    })();
    return () => { alive = false; };
  }, []);

  function toggle(id) {
    const next = new Set(value.selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange({ ...value, selectedIds: next });
  }

  if (loadingStatus) {
    return (
      <div className="border border-purple-900/40 rounded-md p-3 bg-purple-950/20">
        <div className="flex items-center gap-2 text-xs text-purple-300">
          <Loader2 size={12} className="animate-spin" />
          Probing Postiz…
        </div>
      </div>
    );
  }

  if (!status?.enabled) {
    return (
      <div className="border border-purple-900/40 rounded-md p-3 bg-purple-950/10 opacity-70">
        <div className="text-xs font-medium text-purple-300 flex items-center gap-2 mb-1">
          <Globe size={12} /> Cross-post via Postiz
          <span className="ml-auto text-[10px] text-purple-400/70 font-normal italic">
            admin-only
          </span>
        </div>
        <div className="text-[11px] text-gray-500 leading-relaxed">
          Postiz is not configured.{" "}
          {status?.reason && (
            <span className="text-gray-600">({status.reason})</span>
          )}
          <br />
          Run <code className="text-purple-300">docker compose -f docker-compose.postiz.yml up -d</code>,
          generate an API key in the Postiz UI, and add it as{" "}
          <code className="text-purple-300">POSTIZ_API_KEY</code> in <code>.env</code>.
        </div>
      </div>
    );
  }

  return (
    <div className="border border-purple-900/40 rounded-md p-3 bg-purple-950/15">
      <div className="text-xs font-medium text-purple-300 flex items-center gap-2 mb-2">
        <Globe size={12} /> Cross-post via Postiz
        <span className="ml-auto text-[10px] text-purple-400/70 font-normal italic">
          admin-only · {integrations.length} platform{integrations.length === 1 ? "" : "s"} connected
        </span>
      </div>

      {error && (
        <div className="text-[11px] text-red-300 mb-2 flex items-start gap-1">
          <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loadingIntegrations ? (
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <Loader2 size={11} className="animate-spin" /> Loading integrations…
        </div>
      ) : integrations.length === 0 ? (
        <div className="text-[11px] text-gray-500 italic">
          No platforms connected yet. Open Postiz at{" "}
          <a href="http://localhost:5000" target="_blank" rel="noreferrer"
             className="text-purple-300 underline">
            localhost:5000
          </a>{" "}
          → Channels and connect Twitter / Instagram / LinkedIn / etc.
        </div>
      ) : (
        <div className="space-y-1.5">
          {integrations.map((i) => {
            const checked = value.selectedIds.has(i.id);
            return (
              <label
                key={i.id}
                className={`flex items-center gap-2 p-1.5 rounded border cursor-pointer transition-colors
                  ${checked ? "bg-purple-500/10 border-purple-700/60" : "bg-black/30 border-border/40 hover:border-border-hover"}`}
              >
                <input
                  type="checkbox"
                  className="accent-purple-500"
                  checked={checked}
                  onChange={() => toggle(i.id)}
                />
                {i.picture ? (
                  <img src={i.picture} alt="" className="w-6 h-6 rounded-full bg-black/40" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-purple-900/50 flex items-center justify-center text-[10px] uppercase text-purple-200">
                    {(i.provider || "?")[0]}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-gray-200 truncate">{i.name || i.identifier}</div>
                  <div className="text-[10px] text-gray-500 capitalize">{i.provider}</div>
                  {(() => {
                    const m = matchChannelForIntegration(i, channels);
                    return m ? (
                      <div className="text-[10px] text-emerald-400/90 truncate">
                        ✓ branded as {m.name} (logo + watermark + SEO)
                      </div>
                    ) : (
                      <div className="text-[10px] text-yellow-400/90 truncate">
                        ⚠ no style profile — posts raw (video + SEO, no logo)
                      </div>
                    );
                  })()}
                </div>
                {checked && <CheckCircle2 size={12} className="text-purple-400 flex-shrink-0" />}
              </label>
            );
          })}
        </div>
      )}

      {value.selectedIds.size > 0 && (
        <div className="mt-3">
          <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">
            Caption (used on every selected platform — Postiz auto-trims)
          </label>
          <textarea
            value={value.text}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
            placeholder={defaultText || "Watch the full clip on YouTube — link in bio."}
            rows={2}
            className="w-full bg-black/40 border border-border/60 rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-purple-500 resize-none"
          />
        </div>
      )}

      {(() => {
        // Selected integrations with no matching style profile → these post
        // RAW (video + SEO, no logo). Offer the "create a style preference"
        // path the brand spec asks for, otherwise they proceed raw.
        const unmatchedSelected = integrations.filter(
          (i) => value.selectedIds.has(i.id) && !matchChannelForIntegration(i, channels)
        );
        if (unmatchedSelected.length === 0) return null;
        return (
          <div className="mt-3 text-[10px] text-yellow-300/90 bg-yellow-950/20 border border-yellow-900/40 rounded p-2 leading-relaxed">
            <div className="flex items-start gap-1">
              <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
              <span>
                <strong>{unmatchedSelected.length}</strong>{" "}
                selected channel{unmatchedSelected.length === 1 ? "" : "s"} (
                {unmatchedSelected.map((i) => i.name || i.identifier).join(", ")}) have no style
                profile, so they'll post <strong>raw</strong> — video + SEO, no logo/watermark.{" "}
                <RLink to="/channels" className="text-purple-300 underline">
                  Create a style profile
                </RLink>{" "}
                with the exact channel name to brand them next time.
              </span>
            </div>
          </div>
        );
      })()}

      <p className="text-[10px] text-gray-500 mt-2 leading-relaxed flex items-center gap-1">
        <Send size={10} className="text-purple-400" />
        Posts fire <strong className="text-gray-300">after</strong> the YouTube upload succeeds.
        Postiz fetches the video from R2 and uploads to each selected platform.
      </p>
    </div>
  );
}
