import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setToken, getToken, clearToken, onUnauthorized } from "../api/client";

/**
 * AuthContext — one place to read `user`, sign in, sign out.
 *
 * Usage in a component:
 *   const { user, loading, loginEmail, loginGoogle, registerEmail, logout } = useAuth();
 */
const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export default function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [config,  setConfig]  = useState({ google_enabled: false, google_client_id: "", auth_required: false });
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await api.authConfig();
      setConfig(cfg);
    } catch { /* backend might be waking up */ }
    const tok = getToken();
    if (!tok) { setUser(null); setLoading(false); return; }
    try {
      const u = await api.me();
      // /auth/me returns the legacy user when no real JWT is set; treat that
      // as "anonymous" so the UI still prompts login.
      if (u && u.email !== "legacy@kaizer.local") setUser(u);
      else setUser(null);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { hydrate(); }, [hydrate]);

  // If any API call returns 401, drop the token + user so the login page shows.
  useEffect(() => onUnauthorized(() => {
    clearToken();
    setUser(null);
  }), []);

  async function loginEmail(email, password) {
    const res = await api.login({ email, password });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }

  async function registerEmail(email, password, name = "") {
    const res = await api.register({ email, password, name });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }

  async function loginGoogle(credential) {
    const res = await api.googleLogin(credential);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }

  function logout() {
    clearToken();
    setUser(null);
    // Fire-and-forget server call (stateless, mainly for symmetry)
    api.logout().catch(() => {});
  }

  const value = {
    user,
    config,
    loading,
    isAuthenticated: !!user,
    loginEmail,
    registerEmail,
    loginGoogle,
    logout,
    refresh: hydrate,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
