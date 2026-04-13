import React, { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

const ORIGIN = import.meta.env.VITE_API_URL || "";
const FONT_BASE = `${ORIGIN}/api/fonts`;

// Font display names
const FONT_MAP = {
  "Ponnala-Regular.ttf":          "Ponnala",
  "NotoSansTelugu-Bold.ttf":      "NotoSansTelugu",
  "NotoSerifTelugu-Bold.ttf":     "NotoSerifTelugu",
  "HindGuntur-Bold.ttf":          "HindGuntur",
  "Gurajada-Regular.ttf":         "Gurajada",
  "Ramabhadra-Regular.ttf":       "Ramabhadra",
  "TenaliRamakrishna-Regular.ttf":"TenaliRamakrishna",
  "Timmana-Regular.ttf":          "Timmana",
};

// Load fonts once
const _loadedFonts = new Set();
function ensureFont(filename) {
  if (_loadedFonts.has(filename)) return;
  _loadedFonts.add(filename);
  const family = FONT_MAP[filename] || filename.replace(/[-.].*/, "");
  const face = new FontFace(family, `url(${FONT_BASE}/${filename})`);
  face.load().then(f => document.fonts.add(f)).catch(() => {});
}

function getFontFamily(filename) {
  ensureFont(filename);
  return FONT_MAP[filename] || filename.replace(/[-.].*/, "");
}

export default function LivePreview({
  rawUrl, videoUrl, imageUrl,
  frameType, text, fontFile, fontSize, textColor,
  bgColor, followText, followTextColor, fbBg, fbTitleColor,
  sectionPct, cardStyle,
  width = 270, // preview container width
}) {
  const videoRef = useRef(null);
  const h = Math.round(width * (1920 / 1080));
  const scale = width / 1080;
  const fontFamily = getFontFamily(fontFile || "Ponnala-Regular.ttf");

  // Use raw video for live preview (uncomposed), fall back to composed
  const srcUrl = rawUrl ? api.mediaUrl(rawUrl) : (videoUrl ? api.mediaUrl(videoUrl) : "");

  if (frameType === "follow_bar") {
    return (
      <FollowBarPreview
        srcUrl={srcUrl} imageUrl={imageUrl}
        width={width} height={h} scale={scale}
        text={text} fontFamily={fontFamily} fontSize={fontSize} textColor={textColor}
        bgColor={fbBg || bgColor || "#1a0a2e"}
        followText={followText} followTextColor={followTextColor}
        titleColor={fbTitleColor || textColor || "#ffff00"}
      />
    );
  }

  if (frameType === "torn_card") {
    return (
      <TornCardPreview
        srcUrl={srcUrl} imageUrl={imageUrl}
        width={width} height={h} scale={scale}
        text={text} fontFamily={fontFamily} fontSize={fontSize} textColor={textColor}
        sectionPct={sectionPct} cardStyle={cardStyle}
      />
    );
  }

  // Fallback: just show video
  return (
    <div style={{ width, height: h, background: "#000", borderRadius: 6, overflow: "hidden" }}>
      {srcUrl && <video src={srcUrl} controls loop muted autoPlay style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
    </div>
  );
}


function FollowBarPreview({
  srcUrl, width, height, scale,
  text, fontFamily, fontSize, textColor, bgColor,
  followText, followTextColor, titleColor,
}) {
  // Layout proportions (matching pipeline: 1080x1920)
  const txtH = Math.round(323 * scale);
  const txtMx = Math.round(79 * scale);
  const topMy = Math.round(30 * scale);
  const gap = Math.round(10 * scale);
  const vidMx = Math.round(16 * scale);
  const vidW = width - 2 * vidMx;
  const vidH = vidW; // 1:1 square
  const fbarH = height - txtH - gap - vidH - Math.round(16 * scale);
  const scaledFont = Math.max(10, Math.round((fontSize || 60) * scale));

  return (
    <div style={{
      width, height, background: bgColor, borderRadius: 6, overflow: "hidden",
      display: "flex", flexDirection: "column", position: "relative",
    }}>
      {/* Title text area */}
      <div style={{
        height: txtH, padding: `${topMy}px ${txtMx}px 0`,
        display: "flex", alignItems: "center", justifyContent: "center",
        textAlign: "center",
      }}>
        <div style={{
          fontFamily: `"${fontFamily}", serif`,
          fontSize: scaledFont,
          fontWeight: 800,
          color: titleColor || "#ffff00",
          lineHeight: 1.3,
          wordBreak: "break-word",
          textShadow: "1px 1px 3px rgba(0,0,0,0.7)",
          maxHeight: txtH - topMy,
          overflow: "hidden",
        }}>
          {text || "KAIZER NEWS"}
        </div>
      </div>

      {/* Gap */}
      <div style={{ height: gap }} />

      {/* Video area (1:1 square) */}
      <div style={{
        margin: `0 ${vidMx}px`,
        width: vidW, height: vidH,
        background: "#000",
        borderRadius: 4,
        overflow: "hidden",
        flexShrink: 0,
      }}>
        {srcUrl && (
          <video
            src={srcUrl}
            muted autoPlay loop playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
      </div>

      {/* Follow bar */}
      <div style={{
        flex: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: `0 ${vidMx}px`,
        minHeight: Math.max(24, fbarH),
      }}>
        <span style={{
          fontFamily: '"Roboto", "Arial", sans-serif',
          fontSize: Math.max(8, Math.round(14 * scale)),
          fontWeight: 700,
          color: followTextColor || "#fff",
          textTransform: "uppercase",
          letterSpacing: 1,
          textShadow: "1px 1px 2px rgba(0,0,0,0.5)",
        }}>
          {followText || "FOLLOW KAIZER NEWS TELUGU"}
        </span>
      </div>
    </div>
  );
}


function TornCardPreview({
  srcUrl, imageUrl, width, height, scale,
  text, fontFamily, fontSize, textColor,
  sectionPct, cardStyle,
}) {
  const sp = sectionPct || {};
  const videoPct = sp.video || 0.4619;
  const textPct  = sp.text  || 0.1691;
  const imagePct = sp.image || 0.3690;

  const videoH = Math.round(height * videoPct);
  const textH  = Math.round(height * textPct);
  const imageH = height - videoH - textH;
  const scaledFont = Math.max(10, Math.round((fontSize || 52) * scale));

  const cs = cardStyle || {};
  const r0 = cs.bgr0 ?? 193;
  const r1 = cs.bgr1 ?? 128;

  const imgSrc = imageUrl ? api.mediaUrl(imageUrl) : "";

  return (
    <div style={{
      width, height, background: "#111", borderRadius: 6, overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      {/* Video section */}
      <div style={{ height: videoH, background: "#000", overflow: "hidden", flexShrink: 0 }}>
        {srcUrl && (
          <video
            src={srcUrl}
            muted autoPlay loop playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
      </div>

      {/* Text card section (torn paper effect simulated) */}
      <div style={{
        height: textH,
        background: `linear-gradient(180deg, rgb(${r0},0,0) 0%, rgb(${r1},0,0) 100%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: `0 ${Math.round(24 * scale)}px`,
        textAlign: "center",
        position: "relative",
        // Simulated torn edge at top
        clipPath: "polygon(0% 4%, 3% 0%, 7% 3%, 12% 1%, 18% 4%, 24% 0%, 30% 3%, 36% 1%, 42% 4%, 48% 0%, 54% 3%, 60% 1%, 66% 4%, 72% 0%, 78% 3%, 84% 1%, 90% 4%, 95% 0%, 100% 3%, 100% 96%, 97% 100%, 93% 97%, 88% 100%, 82% 96%, 76% 100%, 70% 97%, 64% 100%, 58% 96%, 52% 100%, 46% 97%, 40% 100%, 34% 96%, 28% 100%, 22% 97%, 16% 100%, 10% 96%, 5% 100%, 0% 97%)",
      }}>
        <div style={{
          fontFamily: `"${fontFamily}", serif`,
          fontSize: scaledFont,
          fontWeight: 800,
          color: textColor || "#fff",
          lineHeight: 1.3,
          wordBreak: "break-word",
          textShadow: "2px 2px 4px rgba(0,0,0,0.6)",
          maxHeight: textH - 8,
          overflow: "hidden",
        }}>
          {text || "KAIZER NEWS"}
        </div>
      </div>

      {/* Image section */}
      <div style={{ height: imageH, background: "#0a0a0a", overflow: "hidden" }}>
        {imgSrc ? (
          <img src={imgSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontSize: 12 }}>
            No image
          </div>
        )}
      </div>
    </div>
  );
}
