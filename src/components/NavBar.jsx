import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home, Plus, Menu, X, Palette, UploadCloud, CalendarClock, LineChart,
  Compass, Zap, LogOut, LogIn, UserPlus, Image as ImageIcon,
  Settings as SettingsIcon, CreditCard, Radio, Shield, Rocket, BarChart3,
  Library as LibraryIcon, FileVideo, KeyRound,
  Sparkles, Clapperboard, LayoutGrid, Briefcase, Users, Mic, Tv, Send,
  Lock,
} from "lucide-react";
import { isDesktop } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { navAllowed, HOME_PATH } from "../lib/previewGate";
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

  // Desktop app: v1 renders locally and does NOT publish — hide every
  // publish/channels/upload entry and add the AI Providers key panel.
  const desktop = isDesktop();
  /* The menu, grouped the way the desktop app groups it. Every entry shows
   * whether or not it can be opened: a tester given four menu items cannot
   * tell what the product is, and the gaps read as a thin product rather
   * than a preview with most of it switched off.
   *
   * `desktopOnly` marks the four features the WEB has no route for. It is
   * recorded here instead of being left to the preview gate, because the
   * gate passes everything once VITE_PREVIEW_MODE=0 -- and these four would
   * silently turn from locks into links to routes that do not exist.
   *
   * `when` carries over the desktop/web splits that were already here. */
  const NAV_GROUPS = [
    { heading: "Work", items: [
      { to: "/new",            icon: Sparkles,      label: "Create Video" },
      { to: "/templates",      icon: Clapperboard,  label: "Templates",  desktopOnly: true },
      { to: "/workspace",      icon: LayoutGrid,    label: "Workspace",  desktopOnly: true },
      { to: "/app",            icon: Briefcase,     label: "My Videos" },
      { to: "/library",        icon: LibraryIcon,   label: "Library" },
      { to: "/hub",            icon: Users,         label: "Video Hub",  desktopOnly: true },
      { to: "/assets",         icon: ImageIcon,     label: "Assets" },
      { to: "/tools/compress", icon: FileVideo,     label: "Compress Video", badge: "NEW" },
    ]},
    { heading: "Studios", items: [
      { to: "/podcast",        icon: Mic,           label: "Podcast",    desktopOnly: true },
      { to: "/anchor",         icon: Tv,            label: "News Anchor" },
      { to: "/live-studio",    icon: Radio,         label: "Live Studio", badge: "NEW" },
      // Live Director (multi-camera AI) is unfinished — SaaS/Phase 5 only.
      { to: "/live",           icon: Radio,         label: "Live", badge: "NEW",
        when: (d) => !d.desktop },
    ]},
    { heading: "Distribute", items: [
      { to: "/quick-publish",  icon: Zap,           label: "Quick Publish" },
      // "Channels", not "Style Profiles" — this is the channel-connect page,
      // and the old label predates the 2026-08 reorg.
      { to: "/channels",       icon: Palette,       label: "Channels" },
      { to: "/uploads",        icon: UploadCloud,   label: "Uploads" },
      // Campaigns needs the schedulers, so it stays a SaaS surface.
      { to: "/campaigns",      icon: CalendarClock, label: "Publishing Plans",
        when: (d) => !d.desktop },
    ]},
    { heading: "Intelligence", items: [
      // Both run on PUBLIC data with a YouTube Data API key, so they work
      // with BYO keys on desktop too.
      { to: "/performance",    icon: LineChart,     label: "Insights & SEO" },
      { to: "/trending",       icon: Compass,       label: "Trend Finder" },
    ]},
    { heading: "Account", items: [
      { to: "/desktop-settings", icon: KeyRound,    label: "AI Providers",
        when: (d) => d.desktop },
      // The admin console is server-side; its router is not mounted on desktop.
      { to: "/admin",          icon: Shield,        label: "Admin",
        when: (d) => !d.desktop && !!d.user?.is_admin },
    ]},
  ]
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.when || i.when({ desktop, user })) }))
    .filter((g) => g.items.length > 0);

  /* Which locked entry is explaining itself. One at a time, cleared after a
   * few seconds — the note sits directly under the item that was tapped,
   * because a message anywhere else is a message they have to go and find. */
  const [lockedNote, setLockedNote] = useState("");
  useEffect(() => {
    if (!lockedNote) return undefined;
    const t = setTimeout(() => setLockedNote(""), 4500);
    return () => clearTimeout(t);
  }, [lockedNote]);

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
        to={HOME_PATH}
        className="flex items-center gap-2 px-4 h-12 border-b border-border flex-shrink-0"
      >
        <img src="/brand/kaizerx-logo.svg" alt="KaizerX" className="h-7 w-auto"
          onError={(e) => { e.currentTarget.outerHTML = '<span class="text-white font-black tracking-widest">KAIZER <span class="text-accent2">X</span></span>'; }} />
      </Link>

      {/* Nav links — scrollable when overflowed */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
        {NAV_GROUPS.map(({ heading, items }) => (
          <div key={heading} className="mb-1">
            <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-[0.18em] text-gray-600 select-none">
              {heading}
            </div>

            {items.map(({ to, icon: Icon, label, badge, desktopOnly }) => {
              /* desktopOnly first: it outranks the preview gate, and stays
                 true after the gate is lifted. */
              const lock = desktopOnly ? "desktop" : (navAllowed(to) ? null : "preview");

              if (lock) {
                return (
                  <div key={to}>
                    <button
                      type="button"
                      aria-disabled="true"
                      title="Locked for now"
                      onClick={() => setLockedNote((v) => (v === to ? "" : to))}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm
                                 font-medium border-l-2 border-transparent text-gray-500
                                 hover:bg-white/[0.03] hover:text-gray-400 transition-colors"
                    >
                      <Icon size={16} className="flex-shrink-0 opacity-50" />
                      <span className="flex-1 truncate text-left opacity-80">{label}</span>
                      <Lock size={12} className="flex-shrink-0 opacity-70" />
                    </button>

                    {lockedNote === to && (
                      <p role="status" className="px-3 pb-2 pt-0.5 text-[11px] leading-snug text-gray-500">
                        {lock === "desktop"
                          ? "This feature is locked for now — it lives in the Kaizer X desktop app."
                          : "This feature is locked for now."}
                      </p>
                    )}
                  </div>
                );
              }

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
          </div>
        ))}
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
                {/* Channel connections are a cloud/publishing feature —
                    hidden in the desktop app (desktop v1 renders locally). */}
                {!desktop && (
                  <Link
                    to="/settings/meta"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white"
                  >
                    <SettingsIcon size={13} /> Facebook & Instagram
                  </Link>
                )}
                <Link
                  to="/v4-defaults"
                  onClick={() => setUserMenuOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white"
                >
                  <SettingsIcon size={13} /> V4 Auto-Pipeline Defaults
                </Link>
                {/* Billing is a cloud/SaaS surface — its router is not
                    mounted in desktop mode (desktop licensing lives in the
                    shell, not here). */}
                {!desktop && (
                  <Link
                    to="/billing"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white"
                  >
                    <CreditCard size={13} /> Billing & Plans
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-white"
                >
                  <LogOut size={13} /> Sign out
                </button>
              </div>
            )}
          </div>
        ) : desktop ? (
          // Desktop app: identity lives in the launcher (cloud sign-in +
          // device license) — the in-app web Sign in/Sign up would create a
          // useless LOCAL account, so show the licensed state instead.
          <div className="px-3 py-2 text-[11px] text-gray-500">
            ✓ Licensed on this computer
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
        <Link to={HOME_PATH} className="flex items-center gap-2">
          <img src="/brand/kaizerx-logo.svg" alt="KaizerX" className="h-6 w-auto" />
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
