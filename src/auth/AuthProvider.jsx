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
  // code_login defaults to FALSE on purpose: a backend too old to send
  // it cannot serve the emailed-code routes either, and defaulting the
  // other way would offer a sign-in that fails after the person has
  // typed their address and waited for mail that cannot arrive.
  const [config,  setConfig]  = useState({ google_enabled: false, google_client_id: "", auth_required: false, code_login: false });
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
    } catch (e) {
      // DO NOT clearToken() here — that was the bug that logged people
      // out on every backend blip. Real 401s come through the
      // onUnauthorized event listener below, which is the only place
      // we should be invalidating a session. A transient failure here
      // (backend restart, 5xx, dropped connection) just means we
      // couldn't refresh the user object — keep the token; the next
      // request will recover when the backend is reachable.
      console.warn("auth hydrate transient failure:", e?.message);
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

  /* Sign in with a code emailed to the address. Same shape as
   * loginEmail: the server returns { token, user } and the caller
   * navigates. Kept beside it so both ways in are read together. */
  /* Ask for a sign-in code. Lives here rather than being called as
   * api.requestLoginCode from the page, because every other way in on
   * this screen goes through the context -- and the one that did not was
   * a page using `api` it had never imported. */
  async function requestCode(email) {
    return api.requestLoginCode(email);
  }

  async function loginWithCode(email, code) {
    const res = await api.verifyLoginCode(email, code);
    setToken(res.token);
    setUser(res.user);
    return res;
  }

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

  /** Adopt a (token, user) pair that another flow already minted — used by
   *  the password-reset page so a successful reset signs the user in
   *  immediately without forcing a separate login round-trip. */
  function setSession(token, u) {
    if (token) setToken(token);
    if (u)     setUser(u);
  }

  function logout() {
    clearToken();
    setUser(null);
    // Tell Google Identity Services to NOT auto-sign-back-in. Without
    // this, GIS auto-select fires on the very next page mount (Login,
    // Register) and re-issues a credential immediately — making the
    // sign-out button look broken because the user appears logged
    // back in within milliseconds. ``disableAutoSelect`` persists in
    // localStorage and is the canonical fix per Google's docs.
    try {
      if (window.google?.accounts?.id?.disableAutoSelect) {
        window.google.accounts.id.disableAutoSelect();
      }
    } catch { /* GIS not yet loaded — fine, nothing to disable */ }
    // Fire-and-forget server call (stateless, mainly for symmetry)
    api.logout().catch(() => {});
  }

  const value = {
    loginWithCode,
    requestCode,
    user,
    config,
    loading,
    isAuthenticated: !!user,
    loginEmail,
    registerEmail,
    loginGoogle,
    setSession,
    logout,
    refresh: hydrate,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
