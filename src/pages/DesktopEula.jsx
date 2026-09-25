import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import "./Landing/kaizerx.css";

/* ════════════════════════════════════════════════════════════════════════
   Kaizer X Desktop — End-User License Agreement (route /desktop/eula).
   Static public page. The agreement text ships as a plain-text file at
   /desktop/eula.txt (same file the installer shows), fetched at runtime so
   legal can update it without a frontend rebuild. If the file can't be
   loaded we show graceful fallback copy instead of a blank page.
   ════════════════════════════════════════════════════════════════════════ */

const FALLBACK = `KAIZER X DESKTOP — END-USER LICENSE AGREEMENT

We couldn't load the full agreement text right now. In short:

- Kaizer X Desktop is licensed, not sold, by Sharkify Private Limited.
- One license covers up to three (3) devices that you personally use.
- Your videos, projects, and AI provider keys stay on your computer;
  the app only contacts our servers to verify your license.
- AI features run on your own provider accounts and keys, and you are
  responsible for the content you create and publish.

For the complete agreement, please try again later or contact
support@kaizerx.com and we will send you a copy.`;

export default function DesktopEula() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Kaizer X Desktop — End-User License Agreement";
    let cancelled = false;
    fetch("/desktop/eula.txt")
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error("not found"))))
      .then((t) => {
        if (cancelled) return;
        // Guard against SPA-fallback HTML being served instead of the txt.
        const looksHtml = /^\s*</.test(t || "");
        setText(!t || looksHtml ? FALLBACK : t);
      })
      .catch(() => { if (!cancelled) setText(FALLBACK); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="kx2 kx2-themed" data-kx-theme="dark" style={{ minHeight: "100vh" }}>
      <main className="kx2-container" style={{ padding: "48px 24px 80px", maxWidth: 860 }}>
        <Link
          to="/desktop"
          style={{ color: "var(--kx-link)", fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <ArrowLeft size={14} aria-hidden="true" /> Back to Kaizer X Desktop
        </Link>

        <span className="kx2-strap" style={{ display: "inline-flex", marginTop: 26 }}>
          LEGAL
        </span>
        <h1 className="kx2-heading" style={{ marginTop: 16, fontSize: "1.9rem" }}>
          <FileText size={22} aria-hidden="true" style={{ display: "inline", verticalAlign: "-3px", marginRight: 8 }} />
          Desktop End-User License Agreement
        </h1>

        {loading ? (
          <p style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 8, color: "var(--kx-muted)" }}>
            <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading the agreement…
          </p>
        ) : (
          <div
            className="kx2-card kx2-themed"
            style={{ marginTop: 28, padding: "26px 28px" }}
          >
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "var(--kx-font-body)",
                fontSize: 14.5,
                lineHeight: 1.65,
                color: "var(--kx-body)",
              }}
            >
              {text}
            </pre>
          </div>
        )}

        <p style={{ marginTop: 26, fontSize: 13, color: "var(--kx-muted)" }}>
          Questions about your license? Email{" "}
          <a href="mailto:support@kaizerx.com" style={{ color: "var(--kx-link)" }}>
            support@kaizerx.com
          </a>
          . See also our <Link to="/privacy" style={{ color: "var(--kx-link)" }}>Privacy Policy</Link>{" "}
          and <Link to="/terms" style={{ color: "var(--kx-link)" }}>Terms of Service</Link>.
        </p>
      </main>
    </div>
  );
}
