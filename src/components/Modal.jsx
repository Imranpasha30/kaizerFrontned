import React, { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Generic modal — backdrop, centered dialog, ESC to close, click-outside to close.
 * Usage:
 *   <Modal open={open} onClose={() => setOpen(false)} title="Edit Channel" size="lg">
 *     {children}
 *   </Modal>
 * size: "sm" | "md" | "lg" | "xl"
 */
export default function Modal({ open, onClose, title, children, size = "md", hideClose = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    // Lock body scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  }[size] || "max-w-lg";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-full ${sizeClass} bg-surface border border-border rounded-lg shadow-2xl my-4 max-h-[calc(100vh-2rem)] flex flex-col`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {(title || !hideClose) && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
            <h3 className="text-base font-semibold text-gray-100 truncate pr-6">{title}</h3>
            {!hideClose && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  );
}
