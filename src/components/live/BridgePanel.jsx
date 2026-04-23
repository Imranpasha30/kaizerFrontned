import React, { useEffect, useState } from "react";
import {
  MonitorOff, Save, Loader2, AlertTriangle, CheckCircle2, X,
} from "lucide-react";
import { liveApi } from "../../api/client";
import { Button, Card, Input, LayoutPreview } from "../ui";

const DEFAULT_CFG = {
  asset_url: "",
  silence_threshold_s: 3.0,
  rms_ceiling: 0.02,
  min_duration_s: 4.0,
};

export default function BridgePanel({ eventId, detail, onDetailRefresh }) {
  const [cfg, setCfg]         = useState(DEFAULT_CFG);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");
  const [note, setNote]       = useState("");
  const [appliedLive, setAppliedLive] = useState(undefined);

  useEffect(() => {
    const incoming = detail?.config_json?.bridge_config;
    if (incoming && typeof incoming === "object") {
      setCfg({
        asset_url:           incoming.asset_url ?? "",
        silence_threshold_s: Number(incoming.silence_threshold_s ?? DEFAULT_CFG.silence_threshold_s),
        rms_ceiling:         Number(incoming.rms_ceiling ?? DEFAULT_CFG.rms_ceiling),
        min_duration_s:      Number(incoming.min_duration_s ?? DEFAULT_CFG.min_duration_s),
      });
    }
  }, [detail]);

  const save = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    setErr("");
    setNote("");
    setAppliedLive(undefined);
    try {
      const res = await liveApi.setBridge(eventId, {
        asset_url:           cfg.asset_url || "",
        silence_threshold_s: Number(cfg.silence_threshold_s),
        rms_ceiling:         Number(cfg.rms_ceiling),
        min_duration_s:      Number(cfg.min_duration_s),
      });
      setNote(res?.saved ? "Bridge saved." : "Saved.");
      setAppliedLive(!!res?.applied_live);
      if (typeof onDetailRefresh === "function") onDetailRefresh();
    } catch (ex) {
      setErr(ex.message || String(ex));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 h-full flex flex-col">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Phase 7 · fallback
          </span>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <MonitorOff size={16} className="text-accent2" />
            Dead-Air Bridge
          </h3>
        </div>
        <LayoutPreview layout="bridge" size="sm" />
      </div>

      <p className="text-[13px] text-gray-400 mb-3 leading-snug">
        When every camera is silent for longer than the threshold, the director cuts to this
        asset (image or looping video). The bridge only runs when an asset is set.
      </p>

      {err && (
        <div className="mb-2 p-2 rounded bg-red-900/40 border border-red-700/40 text-[11px] text-red-300 flex items-start gap-2">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span className="flex-1 break-words">{err}</span>
          <button onClick={() => setErr("")}><X size={12} /></button>
        </div>
      )}
      {!err && note && (
        <div className="mb-2 p-2 rounded bg-green-900/30 border border-green-700/40 text-[11px] text-green-300 flex items-start gap-2">
          <CheckCircle2 size={12} className="mt-0.5 flex-shrink-0" />
          <span className="flex-1">
            {note}
            {appliedLive !== undefined && (
              <span className="ml-1 text-green-200">
                ({appliedLive ? "applied live" : "will apply on next start"})
              </span>
            )}
          </span>
        </div>
      )}

      <form onSubmit={save} className="space-y-3 flex-1">
        <Input
          label="Asset URL / path"
          placeholder="/path/to/holding_card.mp4  or  /path/to/slate.png"
          value={cfg.asset_url}
          onChange={(e) => setCfg((c) => ({ ...c, asset_url: e.target.value }))}
        />

        <Input
          type="number"
          step={0.1}
          min={0}
          label="Silence threshold (s)"
          hint="Default 3.0 — trigger the bridge after this much continuous silence."
          value={cfg.silence_threshold_s}
          onChange={(e) => setCfg((c) => ({ ...c, silence_threshold_s: e.target.value }))}
        />

        <Input
          type="number"
          step={0.005}
          min={0}
          label="RMS ceiling"
          hint="Default 0.02 — anything below this counts as silence."
          value={cfg.rms_ceiling}
          onChange={(e) => setCfg((c) => ({ ...c, rms_ceiling: e.target.value }))}
        />

        <Input
          type="number"
          step={0.1}
          min={0}
          label="Min bridge duration (s)"
          hint="Default 4.0 — once shown, keep the bridge on at least this long."
          value={cfg.min_duration_s}
          onChange={(e) => setCfg((c) => ({ ...c, min_duration_s: e.target.value }))}
        />

        <div className="flex justify-end pt-1">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            leftIcon={saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            disabled={saving}
          >
            Save bridge
          </Button>
        </div>
      </form>
    </Card>
  );
}
