import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home, Plus, Menu, X, Palette, UploadCloud, CalendarClock, LineChart,
  Compass, Zap, LogOut, LogIn, UserPlus, Image as ImageIcon,
  Settings as SettingsIcon, CreditCard, Radio, Shield, Rocket, BarChart3,
  Library as LibraryIcon,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import ThemeToggle from "./ThemeToggle";

export default function NavBar() {
  const loc  = useLocation();
  const nav  = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  // Drawer state — only used on mobile (sidebar is always visible on ≥sm).
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Close drawer on every route change so taps don't leave it stuck open.
  useEffect(() => { setOpen(false); }, [loc.pathname]);

  // Close user menu on outside click.
  //
  // ``sidebarBody`` is rendered twice (desktop <aside> + mobile drawer),
  // so a single ref can't reliably point at the visible instance. We
  // tag both instances with data-user-menu="root" and use
  // ``event.target.closest('[data-user-menu="root"]')`` — this walks
  // the real DOM tree from wherever the click happened and returns the
  // nearest matching ancestor regardless of which instance owns it.
  useEffect(() => {
    if (!userMenuOpen) return;
    function onClick(e) {
      const inside = !!(e.target && typeof e.target.closest === "function"
                        && e.target.closest('[data-user-menu="root"]'));
      if (!inside) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [userMenuOpen]);

  const isActive = (path) =>
    path === "/admin" ? loc.pathname.startsWith("/admin") : loc.pathname === path;

  const navLinks = [
    { to: "/library",       icon: LibraryIcon, label: "Library" },
    { to: "/app",           icon: Home,        label: "Jobs" },
    { to: "/new",           icon: Plus,        label: "New Job" },
    { to: "/quick-publish", icon: Zap,         label: "Quick Publish" },
    { to: "/live-studio",   icon: Radio,       label: "Live Studio",  badge: "NEW" },
    { to: "/live",          icon: Radio,       label: "Live", badge: "NEW" },
    { to: "/assets",        icon: ImageIcon,   label: "Assets" },
    { to: "/channels",      icon: Palette,     label: "Style Profiles" },
    { to: "/uploads",       icon: UploadCloud, label: "Uploads" },
    { to: "/campaigns",     icon: CalendarClock, label: "Publishing Plans" },
    { to: "/performance",   icon: LineChart,     label: "Insights" },
    { to: "/trending",      icon: Compass,       label: "Trend Finder" },
    ...(user?.is_admin ? [{ to: "/admin", icon: Shield, label: "Admin" }] : []),
  ];

  const displayName = user?.name?.trim() || user?.email?.split("@")[0] || "Account";
  const avatarLetter = (displayName[0] || "U").toUpperCase();

  function handleLogout() {
    setUserMenuOpen(false);
    logout();
    nav("/login", { replace: true });
  }

  // The sidebar body is reused by both the desktop static rail and the
  // mobile slide-in drawer — extracted so we don't duplicate markup.
  const sidebarBody = (
    <>
      {/* Logo / brand */}
      <Link
        to="/app"
        className="flex items-center gap-2 px-4 h-12 border-b border-border flex-shrink-0"
      >
        <div className="bg-accent rounded px-2 py-0.5 text-white font-black text-sm tracking-widest">
          KAIZER
        </div>
        <span className="text-accent2 text-sm font-black tracking-wider">
          X
        </span>
      </Link>

      {/* Nav links — scrollable when overflowed */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
        {navLinks.map(({ to, icon: Icon, label, badge }) => {
          const a = isActive(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors
                ${a
                  ? "bg-accent/15 text-accent2 border-l-2 border-accent2"
                  : "text-gray-400 hover:bg-white/5 hover:text-gray-200 border-l-2 border-transparent"}`}
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              {badge && <span className="beta-badge">{badge}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom cluster: theme toggle + user menu (or auth links) */}
      <div className="border-t border-border p-2 flex flex-col gap-1 flex-shrink-0">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">
            Theme
          </span>
          <ThemeToggle />
        </div>
        {isAuthenticated ? (
          <div data-user-menu="root" className="relative">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-white/5 text-gray-200"
              title={user?.email}
            >
              <span className="w-7 h-7 rounded-full bg-accent2 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                {avatarLetter}
              </span>
              <span className="flex-1 text-left text-xs font-medium truncate">
                {displayName}
              </span>
            </button>
            {userMenuOpen && (
              <div className="absolute left-2 right-2 bottom-full mb-1 bg-[#0c0c0c] border border-border rounded shadow-xl py-1 z-50">
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
                  to="/settings/meta"
                  onClick={() => setUserMenuOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white"
                >
                  <SettingsIcon size={13} /> Facebook & Instagram
                </Link>
                <Link
                  to="/v4-defaults"
                  onClick={() => setUserMenuOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white"
                >
                  <SettingsIcon size={13} /> V4 Auto-Pipeline Defaults
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
          <div className="flex flex-col gap-1">
            <Link
              to="/login"
              className="flex items-center gap-2 px-3 py-2 rounded text-xs text-gray-300 hover:bg-white/5 hover:text-white"
            >
              <LogIn size={13} /> Sign in
            </Link>
            <Link
              to="/register"
              className="flex items-center gap-2 px-3 py-2 rounded text-xs bg-accent hover:bg-accent2 text-white font-medium"
            >
              <UserPlus size={13} /> Sign up
            </Link>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile-only top bar — hamburger + brand. The full sidebar lives
          off-canvas on screens narrower than `sm` and slides in on demand. */}
      <header className="sm:hidden bg-[#0a0a0a] border-b-2 border-accent flex-shrink-0 h-12 flex items-center justify-between px-4 relative z-40">
        <Link to="/app" className="flex items-center gap-2">
          <div className="bg-accent rounded px-2 py-0.5 text-white font-black text-sm tracking-widest">
            KAIZER
          </div>
          <span className="text-accent2 text-sm font-black tracking-wider">X</span>
        </Link>
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-2 -mr-2 text-gray-400 hover:text-white"
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Desktop sidebar — sticky to the viewport so long pages still
          scroll the main column independently. */}
      <aside
        className="hidden sm:flex flex-col w-56 bg-[#0a0a0a] border-r-2 border-accent flex-shrink-0
                   sticky top-0 h-screen z-40"
      >
        {sidebarBody}
      </aside>

      {/* Mobile slide-in drawer — backdrop + panel. Animates with a
          translate-x; backdrop click closes. */}
      <div
        className={`sm:hidden fixed inset-0 z-50 transition-opacity duration-200
                    ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <div
          className="absolute inset-0 bg-black/60"
          onClick={() => setOpen(false)}
        />
        <aside
          className={`absolute left-0 top-0 h-full w-64 bg-[#0a0a0a] border-r-2 border-accent
                      flex flex-col transform transition-transform duration-200
                      ${open ? "translate-x-0" : "-translate-x-full"}`}
        >
          {sidebarBody}
        </aside>
      </div>
    </>
  );
}
