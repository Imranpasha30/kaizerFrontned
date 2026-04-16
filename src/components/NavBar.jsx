import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Plus, Menu, X } from "lucide-react";

export default function NavBar() {
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  const active = (path) =>
    loc.pathname === path
      ? "text-accent2 border-b-2 border-accent2"
      : "text-gray-400 hover:text-gray-200";

  const navLinks = [
    { to: "/",    icon: Home, label: "Jobs" },
    { to: "/new", icon: Plus, label: "New Job" },
  ];

  return (
    <header className="bg-[#0a0a0a] border-b-2 border-accent flex-shrink-0 relative z-50">
      <div className="max-w-8xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          <div className="bg-accent rounded px-2 py-0.5 text-white font-black text-sm tracking-widest">
            KAIZER
          </div>
          <span className="text-gray-400 text-sm font-medium tracking-wider hidden sm:inline">
            NEWS
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-4 text-sm font-medium">
          {navLinks.map(({ to, icon: Icon, label }) => (
            <Link key={to} to={to} className={`flex items-center gap-1.5 pb-0.5 ${active(to)}`}>
              <Icon size={14} /> {label}
            </Link>
          ))}
        </nav>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen(!open)}
          className="sm:hidden p-2 -mr-2 text-gray-400 hover:text-white"
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <nav className="sm:hidden border-t border-border bg-[#0a0a0a] px-4 pb-3 pt-2 flex flex-col gap-1">
          {navLinks.map(({ to, icon: Icon, label }) => (
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
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
