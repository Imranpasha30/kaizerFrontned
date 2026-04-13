import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Video, Plus, Home } from "lucide-react";

export default function NavBar() {
  const loc = useLocation();
  const active = (path) =>
    loc.pathname === path ? "text-accent2 border-b-2 border-accent2" : "text-gray-400 hover:text-gray-200";

  return (
    <header className="bg-[#0a0a0a] border-b-2 border-accent px-6 h-12 flex items-center gap-6 flex-shrink-0">
      <Link to="/" className="flex items-center gap-2 mr-4">
        <div className="bg-accent rounded px-2 py-0.5 text-white font-black text-sm tracking-widest">
          KAIZER
        </div>
        <span className="text-gray-400 text-sm font-medium tracking-wider">NEWS</span>
      </Link>

      <nav className="flex items-center gap-4 text-sm font-medium">
        <Link to="/" className={`flex items-center gap-1.5 pb-0.5 ${active("/")}`}>
          <Home size={14} /> Jobs
        </Link>
        <Link to="/new" className={`flex items-center gap-1.5 pb-0.5 ${active("/new")}`}>
          <Plus size={14} /> New Job
        </Link>
      </nav>
    </header>
  );
}
