import React, { useEffect, useMemo, useState } from "react";
import {
  Image as ImageIcon, Camera, Save, Trash2, Loader2, AlertTriangle, X, CheckCircle2,
} from "lucide-react";
import { liveApi } from "../../api/client";
import { Button, Card, Input } from "../ui";

const DEFAULT_CFG = {
  enabled: false,
  color: "#00d639",
  similarity: 0.4,
  blend: 0.1,
  bg_asset_path: "",
  bg_asset_kind: "auto",  // auto | image | video
  bg_fit: "cover",        // cover | contain | stretch
};

function mergeCfg(existing) {
  return { ...DEFAULT_CFG, ...(existing || {}) };
}

export default function ChromaPanel({ eventId, cameras, detail, onDetailRefresh }) {
  const [configs, setConfigs] = useState({});     // { cam_id: cfg }
  const [status, setStatus]   = useState({});     // { cam_id: { saving, error, note, appliedLive } }
  const [expanded, setExpanded] = useState({});   // { cam_id: bool }
  const [panelErr, setPanelErr] = useState("");

  // Preload configs from event detail (config_json.chroma_configs).
  useEffect(() => {
    const incoming = detail?.config_json?.chroma_configs || {};
    const next = {};
    (cameras || []).forEach((c) => {
      next[c.cam_id] = mergeCfg(incoming[c.cam_id]);
    });
    setConfigs(next);
  }, [detail, cameras]);

  const camList = useMemo(() => cameras || [], [cameras]);

  const updateCfg = (camId, patch) => {
    setConfigs((prev) => ({
      ...prev,
      [camId]: { ...(prev[camId] || DEFAULT_CFG), ...patch },
    }));
  };

  const setCamStatus = (camId, patch) => {
    setStatus((prev) => ({
      ...prev,
      [camId]: { ...(prev[camId] || {}), ...patch },
    }));
  };

  const save = async (camId) => {
    const cfg = configs[camId] || DEFAULT_CFG;
    setCamStatus(camId, { saving: true, error: "", note: "", appliedLive: undefined });
    try {
      const res = await liveApi.setCameraChroma(eventId, camId, {
        color: cfg.color,
        similarity: Number(cfg.similarity),
        blend: Number(cfg.blend),
        bg_asset_path: cfg.bg_asset_path || "",
        bg_asset_kind: cfg.bg_asset_kind || "auto",
        bg_fit: cfg.bg_fit || "cover",
        enabled: !!cfg.enabled,
      });
      setCamStatus(camId, {
        saving: false,
        error: "",
        note: res?.note || "Saved.",
        appliedLive: !!res?.applied_live,
      });
      if (typeof onDetailRefresh === "function") onDetailRefresh();
    } catch (ex) {
      setCamStatus(camId, { saving: false, error: ex.message || String(ex) });
    }
  };

  const remove = async (camId) => {
    setCamStatus(camId, { saving: true, error: "", note: "", appliedLive: undefined });
    try {
      await liveApi.removeCameraChroma(eventId, camId);
      updateCfg(camId, { ...DEFAULT_CFG });
      setCamStatus(camId, { saving: false, note: "Removed.", appliedLive: false });
      if (typeof onDetailRefresh === "function") onDetailRefresh();
    } catch (ex) {
      setCamStatus(camId, { saving: false, error: ex.message || String(ex) });
    }
  };

  return (
    <Card className="p-4 h-full flex flex-col">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Phase 7 · compositor
          </span>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <ImageIcon size={16} className="text-accent2" />
            Chroma Key
          </h3>
        </div>
        <span className="text-[10px] text-gray-500 mt-1">
          {camList.length} cam{camList.length === 1 ? "" : "s"}
        </span>
      </div>

      {panelErr && (
        <div className="mb-2 p-2 rounded bg-red-900/40 border border-red-700/40 text-[11px] text-red-300 flex items-start gap-2">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span className="flex-1 break-words">{panelErr}</span>
          <button onClick={() => setPanelErr("")}><X size={12} /></button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 max-h-[28rem] pr-1">
        {camList.length === 0 && (
          <p className="text-xs text-gray-600 italic">
            Add cameras to the event first.
          </p>
        )}
        {camList.map((c) => {
          const cfg = configs[c.cam_id] || DEFAULT_CFG;
          const st  = status[c.cam_id] || {};
          const open = !!expanded[c.cam_id] || !!cfg.enabled;
          return (
            <div key={c.cam_id} className="rounded border border-border bg-black/30">
              <div className="flex items-center gap-2 px-3 py-2">
                <Camera size={12} className="text-gray-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white truncate">
                    {c.label || c.cam_id}
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono">{c.cam_id}</div>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-gray-300">
                  <input
                    type="checkbox"
                    checked={!!cfg.enabled}
                    onChange={(e) => {
                      updateCfg(c.cam_id, { enabled: e.target.checked });
                      setExpanded((x) => ({ ...x, [c.cam_id]: true }));
                    }}
                  />
                  Enable
                </label>
                <button
                  type="button"
                  className="text-[10px] text-gray-400 hover:text-white px-1"
                  onClick={() => setExpanded((x) => ({ ...x, [c.cam_id]: !open }))}
                >
                  {open ? "Hide" : "Edit"}
                </button>
              </div>

              {open && (
                <div className="px-3 pb-3 border-t border-border/70 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Key colour</span>
                      <input
                        type="color"
                        className="w-full h-7 mt-1 rounded bg-black/40 border border-border"
                        value={cfg.color || "#00d639"}
                        onChange={(e) => updateCfg(c.cam_id, { color: e.target.value })}
                      />
                    </label>
                    <Input
                      label="Hex"
                      className="[&>input]:font-mono"
                      value={cfg.color || ""}
                      onChange={(e) => updateCfg(c.cam_id, { color: e.target.value })}
                    />
                  </div>

                  <label className="block">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Similarity</span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {Number(cfg.similarity).toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0} max={1} step={0.01}
                      value={cfg.similarity}
                      onChange={(e) => updateCfg(c.cam_id, { similarity: Number(e.target.value) })}
                      className="w-full"
                    />
                  </label>

                  <label className="block">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Blend</span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {Number(cfg.blend).toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0} max={1} step={0.01}
                      value={cfg.blend}
                      onChange={(e) => updateCfg(c.cam_id, { blend: Number(e.target.value) })}
                      className="w-full"
                    />
                  </label>

                  <Input
                    label="Background asset path"
                    hint="Image or looping video on the backend host."
                    placeholder="/path/to/bg.png  or  /path/to/loop.mp4"
                    value={cfg.bg_asset_path || ""}
                    onChange={(e) => updateCfg(c.cam_id, { bg_asset_path: e.target.value })}
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Asset kind</span>
                      <select
                        className="w-full px-2 py-1.5 mt-1 rounded bg-black/40 border border-border text-xs"
                        value={cfg.bg_asset_kind || "auto"}
                        onChange={(e) => updateCfg(c.cam_id, { bg_asset_kind: e.target.value })}
                      >
                        <option value="auto">auto</option>
                        <option value="image">image</option>
                        <option value="video">video</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Fit</span>
                      <select
                        className="w-full px-2 py-1.5 mt-1 rounded bg-black/40 border border-border text-xs"
                        value={cfg.bg_fit || "cover"}
                        onChange={(e) => updateCfg(c.cam_id, { bg_fit: e.target.value })}
                      >
                        <option value="cover">cover</option>
                        <option value="contain">contain</option>
                        <option value="stretch">stretch</option>
                      </select>
                    </label>
                  </div>

                  {st.error && (
                    <div className="p-2 rounded bg-red-900/40 border border-red-700/40 text-[11px] text-red-300 flex items-start gap-2">
                      <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                      <span className="flex-1 break-words">{st.error}</span>
                    </div>
                  )}
                  {!st.error && st.note && (
                    <div className="p-2 rounded bg-green-900/30 border border-green-700/40 text-[11px] text-green-300 flex items-start gap-2">
                      <CheckCircle2 size={12} className="mt-0.5 flex-shrink-0" />
                      <span className="flex-1">
                        {st.note}
                        {st.appliedLive !== undefined && (
                          <span className="ml-1 text-green-200">
                            ({st.appliedLive ? "applied live" : "will apply on next start"})
                          </span>
                        )}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="!text-red-400 !border-red-900/40 hover:!bg-red-950/30"
                      leftIcon={<Trash2 size={11} />}
                      onClick={() => remove(c.cam_id)}
                      disabled={st.saving}
                    >
                      Remove
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      leftIcon={st.saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                      onClick={() => save(c.cam_id)}
                      disabled={st.saving}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-600 mt-3">
        Asset paths resolve on the backend host. Changes apply live when the event is running;
        otherwise they kick in on the next Go Live.
      </p>
    </Card>
  );
}
