import React, { useState, useRef } from "react";
import { X } from "lucide-react";

/**
 * Chip-style tag input — Enter or comma commits a tag, Backspace in empty input removes last.
 * Props:
 *   value: string[]
 *   onChange: (string[]) => void
 *   placeholder?: string
 *   hashtagMode?: boolean — force leading '#' and CamelCase-ish normalization
 *   maxTags?: number
 */
export default function TagInput({ value = [], onChange, placeholder = "", hashtagMode = false, maxTags = 50 }) {
  const [buffer, setBuffer] = useState("");
  const inputRef = useRef(null);

  function normalize(raw) {
    const s = (raw || "").trim();
    if (!s) return "";
    if (!hashtagMode) return s;
    // Force leading '#' and strip spaces/punctuation inside
    const noHash = s.replace(/^#+/, "").replace(/\s+/g, "");
    if (!noHash) return "";
    return `#${noHash}`;
  }

  function commitBuffer(raw) {
    const parts = (raw ?? buffer)
      .split(/[,\n]+/)
      .map(normalize)
      .filter(Boolean);
    if (!parts.length) return;

    const existingLower = new Set((value || []).map((t) => t.toLowerCase()));
    const toAdd = [];
    for (const p of parts) {
      const low = p.toLowerCase();
      if (existingLower.has(low)) continue;
      existingLower.add(low);
      toAdd.push(p);
    }
    if (toAdd.length) {
      const next = [...(value || []), ...toAdd].slice(0, maxTags);
      onChange(next);
    }
    setBuffer("");
  }

  function remove(idx) {
    const next = [...(value || [])];
    next.splice(idx, 1);
    onChange(next);
  }

  function onKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitBuffer();
    } else if (e.key === "Backspace" && !buffer && value.length) {
      e.preventDefault();
      remove(value.length - 1);
    }
  }

  function onPaste(e) {
    const text = e.clipboardData.getData("text");
    if (text.includes(",") || text.includes("\n")) {
      e.preventDefault();
      commitBuffer(text);
    }
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="mt-1 flex flex-wrap items-center gap-1.5 bg-black/40 border border-border rounded px-2 py-1.5 min-h-[36px] focus-within:border-accent cursor-text"
    >
      {(value || []).map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${
            hashtagMode
              ? "bg-accent/20 text-accent2 border border-accent/40"
              : "bg-gray-800 text-gray-200 border border-gray-700"
          }`}
        >
          <span className="max-w-[180px] truncate">{tag}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); remove(i); }}
            className="text-gray-400 hover:text-white"
            aria-label={`Remove ${tag}`}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => commitBuffer()}
        placeholder={value.length ? "" : placeholder}
        className="flex-1 min-w-[100px] bg-transparent text-sm text-gray-100 focus:outline-none placeholder:text-gray-600"
      />
    </div>
  );
}
