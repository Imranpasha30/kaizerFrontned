import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2, ShieldOff } from "lucide-react";
import { useAuth } from "./AuthProvider";

/**
 * AdminRoute — gate for the /admin tree.
 *
 * Behaviour:
 *   - While auth is hydrating, render a subtle spinner (no flash).
 *   - When not authenticated, redirect to /login and remember where we came
 *     from so a successful login can bounce back.
 *   - When authenticated but NOT an admin, render a polite 403 panel.  We
 *     intentionally do not redirect; the user deserves to know *why* they
 *     were refused.
 */
export default function AdminRoute({ children }) {
  const { user, isAuthenticated, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  }

  if (!user?.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark">
        <div className="text-center p-8 max-w-md">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent/10 text-accent2 mb-4">
            <ShieldOff size={26} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Admin only</h1>
          <p className="text-sm text-gray-500">
            This page is restricted to administrators. If you believe this is a
            mistake, contact the platform owner.
          </p>
        </div>
      </div>
    );
  }

  return children;
}
