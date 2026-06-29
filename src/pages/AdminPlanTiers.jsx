/* Admin · Plan Tiers
   ------------------------------------------------------------------
   Edit the subscription tiers (Free / Pro / Enterprise) — channel cap,
   direct-publish access, daily-publish cap, concurrent upload slots, and
   monthly credits. Every enforcement site reads the PlanTier row LIVE from
   the DB, so a save here takes effect on the user's next publish/claim —
   no restart needed. Backend: GET/PATCH /api/admin/plan-tiers. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Layers, Save, Loader2, CheckCircle2, Users, Lock, Unlock } from "lucide-react";
import { adminApi } from "../api/client";
import { Page, PageHeader, DashCard, Chip, ErrorBanner } from "./admin/_primitives";
import Button from "../components/ui/Button";

// Numeric, admin-editable fields. `direct_path_allowed` is rendered
// separately as a toggle. `unlimited:true` fields use the -1 sentinel for
// "no limit"; slot/credits are plain positive integers.
const NUM_FIELDS = [
  {
    key: "max_channels",
    label: "Max channels per publish",
    unlimited: true,
    min: 0,
    hint: "How many YouTube channels one publish can fan out to. Unlimited = no cap.",
  },
  {
    key: "max_publishes_per_day",
    label: "Max publishes / day",
    unlimited: true,
    min: 0,
    hint: "Daily publish cap per user. (Currently advisory — full gating lands later.) Unlimited = no cap.",
  },
  {
    key: "slot_cap_active_uploads",
    label: "Concurrent upload slots",
    unlimited: false,
    min: 1,
    hint: "Max uploads a user on this tier can process at once. Must be ≥ 1 — 0 would stall all their uploads.",
  },
  {
    key: "monthly_credit_allotment",
    label: "Monthly credits",
    unlimited: false,
    min: 0,
    hint: "Credits granted to each user on this tier every month.",
  },
];

const EDITABLE_KEYS = [
  "direct_path_allowed",
  "monthly_credit_allotment",
  "slot_cap_active_uploads",
  "max_channels",
  "max_publishes_per_day",
];

// User-facing label for a field key (so validation errors read like the form,
// not like a DB column).
const labelFor = (k) => NUM_FIELDS.find((f) => f.key === k)?.label || k;

// Tone per tier name so the cards read at a glance.
function toneFor(name) {
  const n = String(name || "").toLowerCase();
  if (n === "enterprise") return "violet";
  if (n === "pro") return "cyan";
  return "default"; // free / unknown
}

function pickEditable(t) {
  return {
    direct_path_allowed: !!t.direct_path_allowed,
    monthly_credit_allotment: Number(t.monthly_credit_allotment ?? 0),
    slot_cap_active_uploads: Number(t.slot_cap_active_uploads ?? 1),
    max_channels: Number(t.max_channels ?? -1),
    max_publishes_per_day: Number(t.max_publishes_per_day ?? -1),
  };
}

export default function AdminPlanTiers() {
  const [tiers, setTiers]   = useState([]);
  const [draft, setDraft]   = useState({});   // id → editable snapshot
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");
  const [saving, setSaving] = useState(null); // tier id currently saving
  const [savedId, setSavedId] = useState(null);
  // Remembers the last positive value typed into an "unlimited-capable" field
  // (per tier+field), so ticking ∞ then unticking restores what the admin had
  // — instead of silently snapping the cap down to the minimum.
  const lastPosRef = useRef({});

  const rememberPositive = (id, key, val) => {
    const m = lastPosRef.current;
    m[id] = { ...(m[id] || {}), [key]: val };
  };
  // Value to restore when ∞ is unticked: last typed positive → original
  // server value (if it was a real cap) → field minimum (never below 1).
  const restorePositive = (t, f) => {
    const remembered = lastPosRef.current?.[t.id]?.[f.key];
    const floor = Math.max(f.min ?? 0, 1);
    if (remembered != null && remembered >= 0) return Math.max(remembered, floor);
    const orig = Number(pickEditable(t)[f.key]);
    if (Number.isFinite(orig) && orig >= 0) return Math.max(orig, floor);
    return floor;
  };

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    adminApi.listPlanTiers()
      .then((res) => {
        const rows = res?.tiers || [];
        setTiers(rows);
        const d = {};
        for (const t of rows) d[t.id] = pickEditable(t);
        setDraft(d);
      })
      .catch((e) => setError(e.message || "Failed to load plan tiers"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const setField = (id, key, value) =>
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));

  // A tier is dirty when its draft differs from the server snapshot.
  const isDirty = (t) => {
    const d = draft[t.id];
    if (!d) return false;
    const orig = pickEditable(t);
    return EDITABLE_KEYS.some((k) => d[k] !== orig[k]);
  };

  const clientInvalid = (d) => {
    if (!d) return "Loading…";
    if (Number(d.slot_cap_active_uploads) < 1) return "Concurrent slots must be ≥ 1.";
    if (Number(d.monthly_credit_allotment) < 0) return "Monthly credits must be ≥ 0.";
    for (const k of ["max_channels", "max_publishes_per_day"]) {
      if (Number(d[k]) < -1) return `${labelFor(k)} must be Unlimited or ≥ 0.`;
    }
    return "";
  };

  const save = async (t) => {
    const d = draft[t.id];
    const bad = clientInvalid(d);
    if (bad) { setError(bad); return; }
    setSaving(t.id);
    setError("");
    try {
      const payload = {
        direct_path_allowed: !!d.direct_path_allowed,
        monthly_credit_allotment: Number(d.monthly_credit_allotment),
        slot_cap_active_uploads: Number(d.slot_cap_active_uploads),
        max_channels: Number(d.max_channels),
        max_publishes_per_day: Number(d.max_publishes_per_day),
      };
      const updated = await adminApi.updatePlanTier(t.id, payload);
      setTiers((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...updated } : x)));
      setDraft((prev) => ({ ...prev, [t.id]: pickEditable({ ...t, ...updated }) }));
      setSavedId(t.id);
      setTimeout(() => setSavedId((s) => (s === t.id ? null : s)), 2500);
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setSaving((s) => (s === t.id ? null : s));
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Billing"
        title="Plan / Tiers"
        accent="cyan"
        subtitle="What each subscription tier can do. Saves apply immediately — no restart."
        actions={
          <Button variant="ghost" size="sm" leftIcon={<Loader2 size={12} className={loading ? "animate-spin" : "hidden"} />} onClick={load}>
            Reload
          </Button>
        }
      />

      <ErrorBanner error={error} onDismiss={() => setError("")} />

      {loading && tiers.length === 0 ? (
        <DashCard>
          <div className="flex items-center gap-2 text-xs py-6 justify-center" style={{ color: "var(--adm-text-4)" }}>
            <Loader2 size={14} className="animate-spin" /> Loading plan tiers…
          </div>
        </DashCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {tiers.map((t) => {
            const d = draft[t.id] || pickEditable(t);
            const dirty = isDirty(t);
            const busy = saving === t.id;
            return (
              <DashCard
                key={t.id}
                icon={Layers}
                title={
                  <span className="flex items-center gap-2">
                    <Chip tone={toneFor(t.name)} className="uppercase tracking-wide">{t.name}</Chip>
                  </span>
                }
                action={
                  <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--adm-text-4)" }}>
                    <Users size={11} /> {t.user_count ?? 0} user{(t.user_count ?? 0) === 1 ? "" : "s"}
                  </span>
                }
              >
                <div className="space-y-3.5">
                  {/* Direct-publish access toggle */}
                  <button
                    type="button"
                    onClick={() => setField(t.id, "direct_path_allowed", !d.direct_path_allowed)}
                    className="w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors"
                    style={{
                      borderColor: d.direct_path_allowed ? "var(--adm-cyan)" : "var(--adm-border)",
                      background: d.direct_path_allowed ? "rgba(6,182,212,0.08)" : "transparent",
                    }}
                  >
                    <span className="flex items-center gap-2 text-xs" style={{ color: "var(--adm-text-2, var(--adm-text))" }}>
                      {d.direct_path_allowed ? <Unlock size={13} /> : <Lock size={13} />}
                      Direct publish (YouTube Data API)
                    </span>
                    <Chip tone={d.direct_path_allowed ? "emerald" : "default"}>
                      {d.direct_path_allowed ? "Allowed" : "Blocked"}
                    </Chip>
                  </button>
                  <p className="text-[10px] -mt-2" style={{ color: "var(--adm-text-5)" }}>
                    When blocked, this tier can only publish via the quota-friendly RTMP-live path.
                  </p>

                  {/* Numeric fields */}
                  {NUM_FIELDS.map((f) => {
                    const val = d[f.key];
                    const unlimited = f.unlimited && Number(val) === -1;
                    return (
                      <div key={f.key} className="space-y-1">
                        <label className="ui-field-label !text-[11px]">{f.label}</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            className="ui-input flex-1"
                            min={f.min}
                            disabled={unlimited}
                            value={unlimited ? "" : String(val)}
                            placeholder={unlimited ? "Unlimited" : ""}
                            onChange={(e) => {
                              // Empty / non-numeric falls back to the field's
                              // minimum (never NaN, never a silent 0 for a
                              // ≥1-only field), and we remember real positives
                              // so the ∞ toggle can restore them.
                              const n = parseInt(e.target.value, 10);
                              const val = Number.isNaN(n) ? (f.min ?? 0) : n;
                              if (val >= 0) rememberPositive(t.id, f.key, val);
                              setField(t.id, f.key, val);
                            }}
                          />
                          {f.unlimited && (
                            <label className="flex items-center gap-1.5 text-[11px] whitespace-nowrap cursor-pointer"
                                   style={{ color: "var(--adm-text-3)" }}>
                              <input
                                type="checkbox"
                                className="accent-current"
                                checked={unlimited}
                                onChange={(e) =>
                                  setField(t.id, f.key, e.target.checked ? -1 : restorePositive(t, f))
                                }
                              />
                              ∞ Unlimited
                            </label>
                          )}
                        </div>
                        <p className="text-[10px]" style={{ color: "var(--adm-text-5)" }}>{f.hint}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 pt-3 flex items-center justify-between border-t" style={{ borderColor: "var(--adm-divider, var(--adm-border))" }}>
                  <span className="text-[10px]" style={{ color: "var(--adm-text-5)" }}>
                    {savedId === t.id ? (
                      <span className="flex items-center gap-1" style={{ color: "#34d399" }}>
                        <CheckCircle2 size={11} /> Saved — live now
                      </span>
                    ) : dirty ? (
                      "Unsaved changes"
                    ) : (
                      "No changes"
                    )}
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!dirty || busy}
                    leftIcon={busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    onClick={() => save(t)}
                  >
                    {busy ? "Saving…" : "Save"}
                  </Button>
                </div>
              </DashCard>
            );
          })}
        </div>
      )}

      <p className="text-[11px]" style={{ color: "var(--adm-text-5)" }}>
        Tier names are fixed (they key credit + signup defaults). Edits apply on each user's next
        publish — the channel cap, direct-publish gate, upload slots and monthly credits all read
        these values live.
      </p>
    </Page>
  );
}
