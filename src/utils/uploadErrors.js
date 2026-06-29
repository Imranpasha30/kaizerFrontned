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
