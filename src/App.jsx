import React from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import NavBar   from "./components/NavBar";
import Home     from "./pages/Home";
import NewJob   from "./pages/NewJob";
import JobDetail from "./pages/JobDetail";
import JobsStats from "./pages/JobsStats";
import Editor   from "./pages/Editor";
import V4Editor from "./pages/V4Editor";
import V4Defaults from "./pages/V4Defaults";
import Channels from "./pages/Channels";
import Uploads  from "./pages/Uploads";
import Campaigns from "./pages/Campaigns";
import Performance from "./pages/Performance";
import Trending from "./pages/Trending";
import QuickPublish from "./pages/QuickPublish";
import ExpressMode  from "./pages/ExpressMode";
import LiveStudio   from "./pages/LiveStudio";
import Assets from "./pages/Assets";
import Settings from "./pages/Settings";
import MetaSettings from "./pages/MetaSettings";
import Billing  from "./pages/Billing";
import LiveDirector from "./pages/LiveDirector";
import ProgramMonitor from "./pages/ProgramMonitor";
import PhoneCamera from "./pages/PhoneCamera";
import Login    from "./pages/Login";
import Register from "./pages/Register";
import Landing  from "./pages/Landing";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword  from "./pages/ResetPassword";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import AuthProvider from "./auth/AuthProvider";
import ProtectedRoute from "./auth/ProtectedRoute";
import AdminRoute from "./auth/AdminRoute";
import Admin from "./pages/Admin";
import { CursorLayer } from "./components/ui";
import { ThemeProvider } from "./theme/ThemeProvider";

/**
 * NavBar is hidden on the auth pages for a full-bleed login experience,
 * and on the public Landing page (which has its own bar).
 */
function Shell({ children }) {
  const loc = useLocation();
  const hideChrome =
    loc.pathname === "/login" ||
    loc.pathname === "/register" ||
    loc.pathname === "/forgot-password" ||
    loc.pathname === "/reset-password" ||
    loc.pathname === "/" ||
    loc.pathname === "/privacy" ||
    loc.pathname === "/terms" ||
    loc.pathname.startsWith("/phone/") ||
    loc.pathname.startsWith("/program/") ||
    loc.pathname.startsWith("/admin");
  // Layout: when chrome is shown, NavBar renders a sticky sidebar on
  // ≥sm and a slide-in drawer + thin top bar on mobile. We use a column
  // wrapper so the mobile top bar can stack above the main content,
  // while the sidebar (position: sticky) anchors itself to the side on
  // wider screens via its own classes.
  return (
    <div className="flex flex-col sm:flex-row min-h-screen">
      {!hideChrome && <NavBar />}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

function GlobalCursor() {
  const loc = useLocation();
  // Hide the app cursor on public marketing/auth routes — those pages
  // own the pointer experience (the landing has its own NibCursor +
  // LivingCursor that should not be doubled up with the app's overlay).
  const hide =
    loc.pathname === "/" ||
    loc.pathname === "/login" ||
    loc.pathname === "/register" ||
    loc.pathname === "/forgot-password" ||
    loc.pathname === "/reset-password" ||
    loc.pathname === "/privacy" ||
    loc.pathname === "/terms";
  if (hide) return null;
  return <CursorLayer />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <GlobalCursor />
        <Shell>
        <Routes>
          {/* Public marketing + auth routes */}
          <Route path="/"                 element={<Landing />} />
          <Route path="/login"            element={<Login />} />
          <Route path="/register"         element={<Register />} />
          <Route path="/forgot-password"  element={<ForgotPassword />} />
          <Route path="/reset-password"   element={<ResetPassword />} />

          {/* Public legal pages — required by Google for the YouTube
              API quota review. Must be reachable without authentication
              so the reviewer can verify them. */}
          <Route path="/privacy"  element={<PrivacyPolicy />} />
          <Route path="/terms"    element={<TermsOfService />} />

          {/* Phase 9 — phone-as-camera public route (scanned via QR). No auth;
              the token in the URL authorises the ingest WebSocket. */}
          <Route path="/phone/:eventId/:camId" element={<PhoneCamera />} />

          {/* App routes — ProtectedRoute redirects to /login when auth is required */}
          <Route path="/app"                           element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/new"                           element={<ProtectedRoute><NewJob /></ProtectedRoute>} />
          <Route path="/quick-publish"                 element={<ProtectedRoute><QuickPublish /></ProtectedRoute>} />
          <Route path="/express"                       element={<ProtectedRoute><ExpressMode /></ProtectedRoute>} />
          <Route path="/live-studio"                   element={<ProtectedRoute><LiveStudio /></ProtectedRoute>} />
          <Route path="/assets"                        element={<ProtectedRoute><Assets /></ProtectedRoute>} />
          <Route path="/settings"                      element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/settings/meta"                 element={<ProtectedRoute><MetaSettings /></ProtectedRoute>} />
          <Route path="/jobs/:jobId"                   element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
          <Route path="/jobs/:jobId/edit"              element={<ProtectedRoute><Editor /></ProtectedRoute>} />
          <Route path="/jobs/:jobId/edit/:clipId"      element={<ProtectedRoute><Editor /></ProtectedRoute>} />
          <Route path="/jobs/:jobId/v4-edit"            element={<ProtectedRoute><V4Editor /></ProtectedRoute>} />
          <Route path="/v4-defaults"                    element={<ProtectedRoute><V4Defaults /></ProtectedRoute>} />
          <Route path="/channels"                      element={<ProtectedRoute><Channels /></ProtectedRoute>} />
          <Route path="/uploads"                       element={<ProtectedRoute><Uploads /></ProtectedRoute>} />
          <Route path="/campaigns"                     element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
          <Route path="/performance"                   element={<ProtectedRoute><Performance /></ProtectedRoute>} />
          <Route path="/trending"                      element={<ProtectedRoute><Trending /></ProtectedRoute>} />
          <Route path="/v2-stats"                      element={<ProtectedRoute><JobsStats /></ProtectedRoute>} />
          <Route path="/billing"                       element={<ProtectedRoute><Billing /></ProtectedRoute>} />
          <Route path="/live"                          element={<ProtectedRoute><LiveDirector /></ProtectedRoute>} />
          <Route path="/program/:eventId"              element={<ProtectedRoute><ProgramMonitor /></ProtectedRoute>} />

          {/* Admin console — nested /admin/<tab>. AdminRoute enforces is_admin. */}
          <Route path="/admin/*"                        element={<AdminRoute><Admin /></AdminRoute>} />
        </Routes>
        </Shell>
      </AuthProvider>
    </ThemeProvider>
  );
}
