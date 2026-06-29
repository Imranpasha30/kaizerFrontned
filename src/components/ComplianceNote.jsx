import React from "react";
import { Info } from "lucide-react";

/**
 * Small, consistent YouTube-API-Services compliance disclaimer box.
 * Used on Trend Finder, Insights, and Pricing to satisfy the YouTube
 * API Services Terms (attribution, public-data-only, not-affiliated,
 * ToS/Privacy links).
 */
export default function ComplianceNote({ children, className = "" }) {
  return (
    <div
      className={`text-[11px] text-gray-500 leading-relaxed bg-black/20 border border-border/60 rounded-lg px-3 py-2 flex gap-2 ${className}`}
    >
      <Info size={12} className="text-gray-600 flex-shrink-0 mt-0.5" />
      <div className="space-y-1 min-w-0">{children}</div>
    </div>
  );
}

// Reusable external link styled for the note.
export function NoteLink({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-gray-400 underline hover:text-gray-200"
    >
      {children}
    </a>
  );
}
