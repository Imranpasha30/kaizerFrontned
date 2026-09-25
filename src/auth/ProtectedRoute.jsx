import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { allowed, BLOCKED_TITLE, BLOCKED_BODY } from "../lib/previewGate";

/**
 * Wraps protected page trees.  Redirects to /login when the server says
 * auth is required and the user isn't signed in.  When auth is optional
 * (dev default) it renders children either way — the legacy fallback user
 * on the backend keeps old data accessible.
 */
export default function ProtectedRoute({ children }) {
  const { loading, isAuthenticated, config, user } = useAuth();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (config.auth_required && !isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }

  /* The one-time details form. A new account fills it before reaching
   * anything else, whichever way it signed in -- the flag rides on the
   * shared user payload, so every auth path carries it.
   *
   * ONLY AN EXPLICIT false GATES. A backend that does not send the field
   * leaves this undefined, and treating undefined as "not done" would send
   * every user on that deployment to a form whose POST 404s there -- locked
   * out, with no way through. Failing open costs at most a form not shown.
   *
   * /onboarding excludes itself, or it would redirect into itself forever.
   * This sits above the preview gate so an unfilled account is sent here
   * even when it asks for a blocked path. */
  if (isAuthenticated
      && user?.onboarding_completed === false
      && loc.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  /* Preview gate. Hiding a nav item is not a gate -- these are public paths
   * and a typed URL or a stale bookmark walks straight past the menu. This
   * sits inside ProtectedRoute so it covers every app route at once, and
   * covers any route added later without anyone remembering to. */
  if (!allowed(loc.pathname)) {
    return (
      <div className="max-w-xl mx-auto mt-24 px-6 text-center">
        <h1 className="text-lg font-semibold text-white mb-2">{BLOCKED_TITLE}</h1>
        <p className="text-sm text-gray-400 leading-relaxed">{BLOCKED_BODY}</p>
        <a href="/channels"
           className="inline-block mt-6 rounded-lg bg-accent2 text-black font-semibold text-sm px-4 py-2">
          Connect a channel
        </a>
      </div>
    );
  }

  return children;
}
