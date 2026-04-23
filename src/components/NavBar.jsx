import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home, Plus, Menu, X, Palette, UploadCloud, Megaphone, BarChart3,
  Radar, Zap, User, LogOut, LogIn, UserPlus, Image as ImageIcon,
  Settings as SettingsIcon, CreditCard, Radio,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

export default function NavBar() {
  const loc  = useLocation();
  const nav  = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    function onClick(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [userMenuOpen]);

  const active = (path) =>
    loc.pathname === path
      ? "text-accent2 border-b-2 border-accent2"
      : "text-gray-400 hover:text-gray-200";

  const navLinks = [
    { to: "/app",           icon: Home,        label: "Jobs" },
    { to: "/new",           icon: Plus,        label: "New Job" },
    { to: "/quick-publish", icon: Zap,         label: "Quick Publish" },
    { to: "/live",          icon: Radio,       label: "Live",    badge: "NEW" },
    { to: "/assets",        icon: ImageIcon,   label: "Assets" },
    { to: "/channels",      icon: Palette,     label: "Style Profiles" },
    { to: "/uploads",       icon: UploadCloud, label: "Uploads" },
    { to: "/campaigns",     icon: Megaphone,   label: "Campaigns" },
    { to: "/performance",   icon: BarChart3,   label: "Performance" },
    { to: "/trending",      icon: Radar,       label: "Trending" },
  ];

  const displayName = user?.name?.trim() || user?.email?.split("@")[0] || "Account";
  const avatarLetter = (displayName[0] || "U").toUpperCase();

  function handleLogout() {
    setUserMenuOpen(false);
    logout();
    nav("/login", { replace: true });
  }

  return (
    <header className="bg-[#0a0a0a] border-b-2 border-accent flex-shrink-0 relative z-50">
      <div className="max-w-8xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
        {/* Logo — links to the authenticated dashboard */}
        <Link to="/app" className="flex items-center gap-2 flex-shrink-0">
          <div className="bg-accent rounded px-2 py-0.5 text-white font-black text-sm tracking-widest">
            KAIZER
          </div>
          <span className="text-gray-400 text-sm font-medium tracking-wider hidden sm:inline">
            NEWS
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-4 text-sm font-medium">
          {navLinks.map(({ to, icon: Icon, label, badge }) => (
            <Link key={to} to={to} className={`flex items-center gap-1.5 pb-0.5 ${active(to)}`}>
              <Icon size={14} /> {label}
              {badge && <span className="beta-badge">{badge}</span>}
            </Link>
          ))}
        </nav>

        {/* Right cluster: user menu + mobile toggle */}
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 text-gray-200"
                title={user?.email}
              >
                <span className="w-6 h-6 rounded-full bg-accent2 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {avatarLetter}
                </span>
                <span className="hidden md:inline text-xs font-medium max-w-[120px] truncate">
                  {displayName}
                </span>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-[#0c0c0c] border border-border rounded shadow-xl py-1 z-50">
                  <div className="px-3 py-2 border-b border-border">
                    <div className="text-sm text-gray-100 font-medium truncate">{displayName}</div>
                    <div className="text-[11px] text-gray-500 truncate">{user?.email}</div>
                    {user?.google && (
                      <div className="text-[10px] text-accent2 mt-0.5">Signed in with Google</div>
                    )}
                  </div>
                  <Link
                    to="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white"
                  >
                    <SettingsIcon size={13} /> Settings & social links
                  </Link>
                  <Link
                    to="/billing"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white"
                  >
                    <CreditCard size={13} /> Billing & Plans
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white"
                  >
                    <LogOut size={13} /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5">
              <Link
                to="/login"
                className="text-xs text-gray-300 hover:text-white px-2 py-1 rounded hover:bg-white/5 flex items-center gap-1"
              >
                <LogIn size={12} /> Sign in
              </Link>
              <Link
                to="/register"
                className="text-xs bg-accent hover:bg-accent2 text-white font-medium px-2.5 py-1 rounded flex items-center gap-1"
              >
                <UserPlus size={12} /> Sign up
              </Link>
            </div>
          )}

          <button
            onClick={() => setOpen(!open)}
            className="sm:hidden p-2 -mr-2 text-gray-400 hover:text-white"
            aria-label="Toggle menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <nav className="sm:hidden border-t border-border bg-[#0a0a0a] px-4 pb-3 pt-2 flex flex-col gap-1">
          {navLinks.map(({ to, icon: Icon, label, badge }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium
                ${loc.pathname === to
                  ? "bg-accent/10 text-accent2"
                  : "text-gray-400 hover:bg-white/5 hover:text-gray-200"}`}
            >
              <Icon size={16} /> {label}
              {badge && <span className="beta-badge">{badge}</span>}
            </Link>
          ))}
          {!isAuthenticated && (
            <>
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-gray-300 hover:bg-white/5"
              >
                <LogIn size={16} /> Sign in
              </Link>
              <Link
                to="/register"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-white bg-accent hover:bg-accent2"
              >
                <UserPlus size={16} /> Sign up
              </Link>
            </>
          )}
          {isAuthenticated && (
            <button
              onClick={() => { setOpen(false); handleLogout(); }}
              className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-gray-300 hover:bg-white/5 text-left"
            >
              <LogOut size={16} /> Sign out ({displayName})
            </button>
          )}
        </nav>
      )}
    </header>
  );
}
