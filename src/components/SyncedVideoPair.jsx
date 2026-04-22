import React, { useRef, useState, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

/**
 * SyncedVideoPair — Two video players that stay in sync.
 *
 * Props:
 *   leftSrc   string | null  — URL of the "current" video
 *   rightSrc  string | null  — URL of the "beta" video
 *   leftLabel  string
 *   rightLabel string
 */
export default function SyncedVideoPair({ leftSrc, rightSrc, leftLabel = "CURRENT", rightLabel = "BETA" }) {
  const leftRef  = useRef(null);
  const rightRef = useRef(null);

  const [playing,      setPlaying]      = useState(false);
  const [muted,        setMuted]        = useState(true);
  const [currentTime,  setCurrentTime]  = useState(0);
  const [duration,     setDuration]     = useState(0);
  const [leftReady,    setLeftReady]    = useState(false);
  const [rightReady,   setRightReady]   = useState(false);
  // Prevent feedback loops when programmatically seeking
  const seekingRef = useRef(false);

  /* ── helpers ─────────────────────────────────────────── */
  const bothVideos = useCallback((fn) => {
    if (leftRef.current)  fn(leftRef.current);
    if (rightRef.current) fn(rightRef.current);
  }, []);

  function togglePlay() {
    if (!leftRef.current && !rightRef.current) return;
    if (playing) {
      bothVideos(v => v.pause());
    } else {
      bothVideos(v => v.play().catch(() => {}));
    }
    setPlaying(p => !p);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    bothVideos(v => { v.muted = next; });
  }

  function handleTimeUpdate(e) {
    if (seekingRef.current) return;
    const t = e.target.currentTime;
    setCurrentTime(t);
    // Sync the other video if drift > 0.15s
    const other = e.target === leftRef.current ? rightRef.current : leftRef.current;
    if (other && Math.abs(other.currentTime - t) > 0.15) {
      seekingRef.current = true;
      other.currentTime = t;
      setTimeout(() => { seekingRef.current = false; }, 100);
    }
  }

  function handleSeekBar(e) {
    const t = Number(e.target.value);
    seekingRef.current = true;
    bothVideos(v => { v.currentTime = t; });
    setCurrentTime(t);
    setTimeout(() => { seekingRef.current = false; }, 150);
  }

  function handleLoadedMetadata(e) {
    setDuration(prev => Math.max(prev, e.target.duration || 0));
    if (e.target === leftRef.current)  setLeftReady(true);
    if (e.target === rightRef.current) setRightReady(true);
  }

  function handleEnded() {
    setPlaying(false);
    setCurrentTime(0);
  }

  function fmt(s) {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = String(Math.floor(s % 60)).padStart(2, "0");
    return `${m}:${sec}`;
  }

  const hasLeft  = Boolean(leftSrc);
  const hasRight = Boolean(rightSrc);

  /* ── render ──────────────────────────────────────────── */
  return (
    <div className="svp-wrapper">
      {/* Video pair */}
      <div className="synced-video-pair">
        {/* Left player */}
        <div className="svp-player-col">
          <div className="svp-label left-label">{leftLabel}</div>
          <div className="svp-video-box">
            {hasLeft ? (
              <>
                {!leftReady && (
                  <div className="svp-spinner-overlay" aria-hidden>
                    <div className="svp-spinner" />
                  </div>
                )}
                <video
                  ref={leftRef}
                  src={leftSrc}
                  muted={muted}
                  loop={false}
                  playsInline
                  preload="metadata"
                  className={`svp-video${leftReady ? " svp-video--ready" : ""}`}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={handleEnded}
                />
              </>
            ) : (
              <div className="svp-placeholder">
                <span>No video yet</span>
              </div>
            )}
          </div>
        </div>

        {/* Right player */}
        <div className="svp-player-col">
          <div className="svp-label right-label">{rightLabel}</div>
          <div className="svp-video-box">
            {hasRight ? (
              <>
                {!rightReady && (
                  <div className="svp-spinner-overlay" aria-hidden>
                    <div className="svp-spinner" />
                  </div>
                )}
                <video
                  ref={rightRef}
                  src={rightSrc}
                  muted={muted}
                  loop={false}
                  playsInline
                  preload="metadata"
                  className={`svp-video${rightReady ? " svp-video--ready" : ""}`}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={handleEnded}
                />
              </>
            ) : (
              <div className="svp-placeholder svp-placeholder--beta">
                <div className="svp-placeholder-icon">&#9654;</div>
                <span>Render to see the beta version</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Combined controls */}
      <div className="svp-controls">
        <button
          type="button"
          className="svp-ctrl-btn"
          onClick={togglePlay}
          title={playing ? "Pause" : "Play"}
          disabled={!hasLeft && !hasRight}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>

        <span className="svp-time">{fmt(currentTime)}</span>

        <input
          type="range"
          className="svp-seek"
          min={0}
          max={duration || 100}
          step={0.05}
          value={currentTime}
          onChange={handleSeekBar}
          disabled={!duration}
        />

        <span className="svp-time">{fmt(duration)}</span>

        <button
          type="button"
          className="svp-ctrl-btn"
          onClick={toggleMute}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>
    </div>
  );
}
