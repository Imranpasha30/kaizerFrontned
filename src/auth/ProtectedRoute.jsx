import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "./AuthProvider";

/**
 * Wraps protected page trees.  Redirects to /login when the server says
 * auth is required and the user isn't signed in.  When auth is optional
 * (dev default) it renders children either way — the legacy fallback user
 * on the backend keeps old data accessible.
 */
export default function ProtectedRoute({ children }) {
  const { loading, isAuthenticated, config } = useAuth();
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

  return children;
}
