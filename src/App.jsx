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
import Login    from "./pages/Login";
import Register from "./pages/Register";
import AuthProvider from "./auth/AuthProvider";
import ProtectedRoute from "./auth/ProtectedRoute";

/** NavBar is hidden on the auth pages for a full-bleed login experience. */
function Shell({ children }) {
  const loc = useLocation();
  const hideChrome = loc.pathname === "/login" || loc.pathname === "/register";
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
      <Shell>
        <Routes>
          {/* Public auth routes */}
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* App routes — ProtectedRoute redirects to /login when auth is required */}
          <Route path="/"                              element={<ProtectedRoute><Home /></ProtectedRoute>} />
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
        </Routes>
      </Shell>
    </AuthProvider>
  );
}
