import React from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import NavBar   from "./components/NavBar";
import Home     from "./pages/Home";
import NewJob   from "./pages/NewJob";
import JobDetail from "./pages/JobDetail";
import Editor   from "./pages/Editor";
import Channels from "./pages/Channels";
import Uploads  from "./pages/Uploads";
import Campaigns from "./pages/Campaigns";
import Performance from "./pages/Performance";
import Trending from "./pages/Trending";
import QuickPublish from "./pages/QuickPublish";
import Assets from "./pages/Assets";
import Settings from "./pages/Settings";
import Billing  from "./pages/Billing";
import LiveDirector from "./pages/LiveDirector";
import ProgramMonitor from "./pages/ProgramMonitor";
import PhoneCamera from "./pages/PhoneCamera";
import Login    from "./pages/Login";
import Register from "./pages/Register";
import Landing  from "./pages/Landing";
import AuthProvider from "./auth/AuthProvider";
import ProtectedRoute from "./auth/ProtectedRoute";
import { CursorLayer } from "./components/ui";

/**
 * NavBar is hidden on the auth pages for a full-bleed login experience,
 * and on the public Landing page (which has its own bar).
 */
function Shell({ children }) {
  const loc = useLocation();
  const hideChrome =
    loc.pathname === "/login" ||
    loc.pathname === "/register" ||
    loc.pathname === "/" ||
    loc.pathname.startsWith("/phone/") ||
    loc.pathname.startsWith("/program/");
  return (
    <div className="flex flex-col min-h-screen">
      {!hideChrome && <NavBar />}
      <main className="flex-1">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CursorLayer />
      <Shell>
        <Routes>
          {/* Public marketing + auth routes */}
          <Route path="/"         element={<Landing />} />
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Phase 9 — phone-as-camera public route (scanned via QR). No auth;
              the token in the URL authorises the ingest WebSocket. */}
          <Route path="/phone/:eventId/:camId" element={<PhoneCamera />} />

          {/* App routes — ProtectedRoute redirects to /login when auth is required */}
          <Route path="/app"                           element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/new"                           element={<ProtectedRoute><NewJob /></ProtectedRoute>} />
          <Route path="/quick-publish"                 element={<ProtectedRoute><QuickPublish /></ProtectedRoute>} />
          <Route path="/assets"                        element={<ProtectedRoute><Assets /></ProtectedRoute>} />
          <Route path="/settings"                      element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/jobs/:jobId"                   element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
          <Route path="/jobs/:jobId/edit"              element={<ProtectedRoute><Editor /></ProtectedRoute>} />
          <Route path="/jobs/:jobId/edit/:clipId"      element={<ProtectedRoute><Editor /></ProtectedRoute>} />
          <Route path="/channels"                      element={<ProtectedRoute><Channels /></ProtectedRoute>} />
          <Route path="/uploads"                       element={<ProtectedRoute><Uploads /></ProtectedRoute>} />
          <Route path="/campaigns"                     element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
          <Route path="/performance"                   element={<ProtectedRoute><Performance /></ProtectedRoute>} />
          <Route path="/trending"                      element={<ProtectedRoute><Trending /></ProtectedRoute>} />
          <Route path="/billing"                       element={<ProtectedRoute><Billing /></ProtectedRoute>} />
          <Route path="/live"                          element={<ProtectedRoute><LiveDirector /></ProtectedRoute>} />
          <Route path="/program/:eventId"              element={<ProtectedRoute><ProgramMonitor /></ProtectedRoute>} />
        </Routes>
      </Shell>
    </AuthProvider>
  );
}
