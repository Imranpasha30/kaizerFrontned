// Shared upload-failure helpers — moved out of pages/Uploads.jsx so the
// per-channel audit rows on PublishDetail reuse the exact same
// operator-facing copy as the legacy flat upload rows.

export function lastLineOf(s) {
  if (!s) return "";
  const lines = String(s).trim().split("\n");
  return lines[lines.length - 1];
}

// Map provider_failed `last_error` to a human-readable headline + the
// concrete operator action needed. Mirrors the substring set used in
// youtube/worker.py:_TERMINAL_PROVIDER_HINTS so the UI copy is honest
// about why retry alone won't help.
export function classifyProviderFail(err) {
  const e = String(err || "").toLowerCase();
  if (e.includes("no subscription found")) {
    return {
      title: "Postiz subscription expired",
      body: "Your Postiz workspace has no active subscription. Until it's renewed, every upload routed through Postiz will be rejected.",
      cta: "Open Postiz route settings",
      ctaHref: "/admin/settings",
    };
  }
  if (e.includes("invalid postiz token") || e.includes("postiz integration not found")) {
    return {
      title: "Postiz integration broken",
      body: "The Postiz token / integration this upload depends on is missing or rejected. An admin needs to reconnect it.",
      cta: "Open Postiz route settings",
      ctaHref: "/admin/settings",
    };
  }
  if (e.includes("invalid_grant")) {
    return {
      title: "YouTube channel disconnected",
      body: "The OAuth refresh token for this destination was revoked (manual revoke, password reset, or 6-month inactivity). Reconnect the channel before retrying.",
      cta: "Reconnect this channel",
      ctaHref: "/channels",
    };
  }
  if (e.includes("youtubesignuprequired") || e.includes("account has been deleted")) {
    return {
      title: "Destination YouTube channel unavailable",
      body: "The Google account this upload was targeting either has no YouTube channel or the channel was deleted. Pick a different destination.",
      cta: "Pick another channel",
      ctaHref: "/channels",
    };
  }
  return {
    title: "Upstream provider rejected the upload",
    body: lastLineOf(err || "") || "The upload provider returned a terminal error.",
    cta: null,
    ctaHref: null,
  };
}

// Turn a publish-time API error (from api.client `req`, which attaches
// `.status` and the raw `.detail`) into a clear, friendly sentence — so the
// publish dialogs never show "[object Object]" or a raw backend string.
export function friendlyPublishError(err) {
  const detail = err && typeof err === "object" ? err.detail : null;
  const code = (detail && typeof detail === "object" ? detail.code : "") || "";
  const rawMsg = (err && err.message) || (typeof detail === "string" ? detail : "") || "";
  switch (code) {
    case "insufficient_credits": {
      const bal = detail?.balance, need = detail?.needed;
      const nums = (bal != null && need != null) ? ` (you have ${bal}, this needs ${need})` : "";
      return `You're out of upload credits${nums}. Top up credits, or an admin can put your account on the Unlimited tier.`;
    }
    case "direct_path_requires_pro":
      return "Your plan doesn't allow direct YouTube uploads. Upgrade the plan, or set the channel's route to RTMP-live.";
    case "channel_cap_exceeded":
      return "You picked more channels than your plan allows in one publish. Remove a few destinations, or upgrade the plan.";
    case "plan_tier_unknown":
      return "Your account isn't on a billing plan yet, so publishing is blocked. An admin needs to assign a plan tier.";
    case "master_video_not_ready":
      return "This video hasn't finished rendering yet. Wait until it's ready, then publish.";
    case "channel_not_owned":
      return "One of the selected channels isn't connected to your account. Re-pick your destinations and try again.";
    case "oauth_token_missing":
      return "A selected channel isn't linked to YouTube. Open Channels, reconnect it, then publish again.";
    case "duplicate_publish_version":
      return "Already published to these channels with the same video, SEO and privacy — nothing new to upload. Change the SEO, thumbnail or privacy to publish a new version.";
    case "thumbnail_source_mismatch":
      return "Thumbnail mismatch: YouTube Shorts don't take a custom thumbnail. Use a Regular video, or clear the custom thumbnail.";
    default:
      break;
  }
  // No known code. Show the server message if it's a readable string,
  // otherwise a safe generic — never "[object Object]".
  if (rawMsg && rawMsg !== "[object Object]") return rawMsg;
  if (err?.status === 402) return "You're out of upload credits. Top up credits, or switch to the Unlimited tier.";
  if (err?.status === 403) return "Your plan doesn't allow this publish. Check your plan or channel settings.";
  return "Publish failed. Please try again.";
}
