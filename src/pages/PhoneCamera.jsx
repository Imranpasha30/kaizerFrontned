import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Camera, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

/**
 * PhoneCamera — the page the user's phone opens after scanning the QR code
 * from the Live Director. Uses getUserMedia + MediaRecorder to capture the
 * device camera and push webm chunks over a WebSocket to the backend ingest
 * endpoint. The backend fans those chunks out to any monitoring director
 * page. Public route (no auth required).
 *
 * State machine: idle → asking → connecting → live → (stop|error)
 */
export default function PhoneCamera() {
  const { eventId, camId } = useParams();
  const [search] = useSearchParams();
  const token = search.get("token") || "";

  const videoRef = useRef(null);
  const recorderRef = useRef(null);
  const wsRef = useRef(null);
  const streamRef = useRef(null);

  const [state, setState] = useState("idle"); // idle|asking|connecting|live|error
  const [error, setError] = useState("");

  // Clean up stream + recorder + ws on unmount.
  const cleanup = useCallback(() => {
    try {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        recorderRef.current.stop();
      }
    } catch { /* noop */ }
    recorderRef.current = null;

    try {
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
         wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        wsRef.current.close();
      }
    } catch { /* noop */ }
    wsRef.current = null;

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch { /* noop */ }
        });
      }
    } catch { /* noop */ }
    streamRef.current = null;

    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch { /* noop */ }
    }
  }, []);

  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  const start = useCallback(async () => {
    if (!token) {
      setState("error");
      setError("Missing token. Ask the director page to regenerate your QR.");
      return;
    }

    setState("asking");
    setError("");

    let stream;
    try {
      // Prefer back camera on phone; mobile browsers honour facingMode.
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      setState("error");
      setError(err?.message || "Camera permission denied");
      return;
    }

    setState("connecting");

    // Negotiate a MediaRecorder mime-type the phone's browser supports.
    let mimeType = "video/webm; codecs=vp9,opus";
    if (!window.MediaRecorder || !window.MediaRecorder.isTypeSupported) {
      setState("error");
      setError("MediaRecorder is not supported in this browser.");
      return;
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm; codecs=vp8,opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      setState("error");
      setError("This browser cannot record webm — try Chrome or Firefox.");
      return;
    }

    let recorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 1_200_000,
      });
    } catch (err) {
      setState("error");
      setError(err?.message || "Could not create MediaRecorder");
      return;
    }
    recorderRef.current = recorder;

    // Build WS URL: phone is on the same LAN, but the Vite dev server (:3002)
    // doesn't proxy WebSockets well across the LAN, so we hit the backend
    // directly on :8000. If later deployed behind a reverse proxy at the same
    // origin, the operator can change this URL construction to share origin.
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;
    const url = `${wsProto}//${host}:8000/api/live/ws/ingest/${encodeURIComponent(eventId)}/${encodeURIComponent(camId)}?token=${encodeURIComponent(token)}`;

    let ws;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      setState("error");
      setError(err?.message || "Could not open WebSocket");
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setState("live");
      recorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          try {
            const buf = await e.data.arrayBuffer();
            ws.send(buf);
          } catch { /* chunk dropped */ }
        }
      };
      try {
        recorder.start(500); // flush ~every 500ms
      } catch (err) {
        setState("error");
        setError(err?.message || "Could not start recorder");
      }
    };

    ws.onerror = () => {
      setState("error");
      setError("WebSocket connection failed. Check that your phone is on the same WiFi as the laptop.");
    };

    ws.onclose = () => {
      try {
        if (recorderRef.current && recorderRef.current.state === "recording") {
          recorderRef.current.stop();
        }
      } catch { /* noop */ }
      setState((prev) => (prev === "error" ? "error" : "idle"));
    };
  }, [eventId, camId, token]);

  const stop = useCallback(() => {
    cleanup();
    setState("idle");
  }, [cleanup]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <header className="p-4 flex items-center gap-2 border-b border-white/10">
        <Camera size={18} className="text-accent2" />
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold">KAIZER · phone camera</h1>
          <p className="text-[10px] text-white/50 truncate">
            Event {eventId} · {camId}
          </p>
        </div>
        {state === "live" && <span className="ui-live-dot" />}
      </header>

      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-contain"
        />

        {state === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <Camera size={48} className="text-accent2" />
            <h2 className="text-xl font-bold">Ready to stream</h2>
            <p className="text-sm text-white/60 max-w-sm">
              Tap start. This browser will ask for camera and microphone permission.
              Keep the director window on the laptop open.
            </p>
            <button onClick={start} className="ui-btn-primary">
              Start streaming
            </button>
          </div>
        )}

        {state === "asking" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <Loader2 size={28} className="animate-spin text-white/60" />
            <p className="text-sm text-white/60">Requesting camera…</p>
          </div>
        )}

        {state === "connecting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center pointer-events-none">
            <Loader2 size={28} className="animate-spin text-white/60" />
            <p className="text-sm text-white/60">Connecting to director…</p>
          </div>
        )}

        {state === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-8 text-center bg-black/80">
            <AlertTriangle size={32} className="text-red-400" />
            <p className="text-sm text-white/80 max-w-sm">{error || "Something went wrong."}</p>
            <button onClick={start} className="ui-btn-ghost mt-4">
              Retry
            </button>
          </div>
        )}
      </div>

      <footer className="p-4 border-t border-white/10 flex gap-2">
        {state === "live" ? (
          <button onClick={stop} className="ui-btn-ghost w-full !text-red-400">
            Stop streaming
          </button>
        ) : state === "connecting" || state === "asking" ? (
          <div className="w-full flex items-center justify-center gap-2 text-sm text-white/60">
            <Loader2 size={14} className="animate-spin" />
            {state === "asking" ? "Requesting camera…" : "Connecting…"}
          </div>
        ) : state === "idle" ? (
          <div className="w-full text-center text-[11px] text-white/40">
            Same-WiFi, no app install required.
          </div>
        ) : state === "error" ? (
          <div className="w-full flex items-center justify-center gap-2 text-sm text-red-400">
            <AlertTriangle size={14} /> Stream offline
          </div>
        ) : (
          <span className="flex items-center gap-2 text-sm text-green-400">
            <CheckCircle2 size={14} /> Live
          </span>
        )}
      </footer>
    </div>
  );
}
