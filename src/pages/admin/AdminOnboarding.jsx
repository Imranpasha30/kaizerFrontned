/* What people told us on their first sign-in.
 *
 * The details form is mandatory for a new account and cannot be skipped, so
 * this table is the operator's record of every customer: who they are, how to
 * reach them, which channel they publish to and in which languages.
 *
 * THREE STATES, KEPT APART. "Submitted" is a person who filled the form.
 * "Exempt" is an account that predates the form and was never asked -- those
 * rows hold a name and email copied off the account and nothing else.
 * "Waiting" is a new account that has not filled it yet. Adding exempt into
 * submitted would tell the operator they hold contact details they do not.
 *
 * Built from the admin panel's own primitives so it sits beside the other
 * tabs rather than looking bolted on.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ClipboardList, Search, RefreshCw, ExternalLink, Users, CheckCircle2,
  Clock, ShieldCheck, Globe,
} from "lucide-react";
import { adminApi } from "../../api/client";
import {
  Page, PageHeader, KpiTile, DashCard, DataTable, Chip, ErrorBanner, EmptySlot,
} from "./_primitives";

const LANG_NAME = {
  te: "Telugu", hi: "Hindi", ta: "Tamil", kn: "Kannada", ml: "Malayalam",
  bn: "Bengali", mr: "Marathi", gu: "Gujarati", en: "English",
};

export default function AdminOnboarding() {
  const [data, setData]   = useState(null);
  const [q, setQ]         = useState("");
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (term = "") => {
    setBusy(true);
    try {
      setData(await adminApi.onboarding(term));
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(""); }, [load]);

  const stats = data?.stats || {};
  const rows  = data?.rows  || [];
  const langs = Object.entries(stats.languages || {});

  return (
    <Page>
      <PageHeader
        eyebrow="Customers"
        title="Signup details"
        subtitle="Collected once, on a new account's first sign-in. Cannot be skipped."
        accent="violet"
        actions={
          <button
            type="button"
            onClick={() => load(q)}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium
                       border border-[color:var(--adm-border)] hover:border-[color:var(--adm-border-hover)]
                       disabled:opacity-50"
          >
            <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

      {/* The four numbers an operator actually wants. "Forms filled" is the
          one they asked for; the rest explain the gap between it and the
          user count, which is otherwise baffling. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiTile
          tone="cyan"  icon={CheckCircle2} label="Forms filled"
          value={stats.submitted ?? "—"}
          sub="people who completed it"
        />
        <KpiTile
          tone="amber" icon={Clock} label="Waiting"
          value={stats.pending ?? "—"}
          sub="new accounts yet to fill it"
        />
        <KpiTile
          tone="violet" icon={ShieldCheck} label="Exempt"
          value={stats.exempt ?? "—"}
          sub="predate the form, never asked"
        />
        <KpiTile
          tone="default" icon={Users} label="Accounts"
          value={stats.users ?? "—"}
          sub="total users"
        />
      </div>

      {langs.length > 0 && (
        <DashCard title="Languages published in" icon={Globe} className="mb-5">
          <div className="flex flex-wrap gap-2 p-1">
            {langs.map(([code, n]) => (
              <Chip key={code} tone="cyan">
                {LANG_NAME[code] || code} · {n}
              </Chip>
            ))}
          </div>
        </DashCard>
      )}

      <DashCard
        title={`Submissions${data ? ` (${data.matched ?? rows.length})` : ""}`}
        icon={ClipboardList}
        action={
          <form
            onSubmit={(e) => { e.preventDefault(); load(q); }}
            className="flex items-center gap-2"
          >
            <div className="relative">
              <Search size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="name, company, email, mobile, channel"
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg w-64
                           bg-[color:var(--adm-surface)]
                           border border-[color:var(--adm-border)]
                           focus:border-[color:var(--adm-border-hover)] outline-none"
              />
            </div>
          </form>
        }
      >
        {rows.length === 0 ? (
          <EmptySlot text={busy ? "Loading…" : "Nobody has filled the form yet."} />
        ) : (
          <DataTable
            headers={[
              { key: "who",      label: "Name" },
              { key: "company",  label: "Company / channel" },
              { key: "mobile",   label: "Mobile" },
              { key: "email",    label: "Email" },
              { key: "langs",    label: "Languages" },
              { key: "channel",  label: "Channel" },
              { key: "site",     label: "Website" },
              { key: "when",     label: "Submitted" },
            ]}
          >
            {rows.map((r) => (
              <tr key={r.user_id} className="hover:bg-[color:var(--adm-card-hover)]">
                <td className="px-3 py-2">
                  <div className="text-[13px]">{r.full_name || "—"}</div>
                  {/* The account address, when it differs from the one they
                      typed -- billing often goes somewhere else. */}
                  {r.account_email && r.account_email !== r.email && (
                    <div className="text-[10.5px] opacity-50">{r.account_email}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-[13px]">{r.company_name || "—"}</td>
                <td className="px-3 py-2 text-[13px] whitespace-nowrap">
                  {r.mobile
                    ? <a href={`tel:${r.mobile}`} className="hover:underline">{r.mobile}</a>
                    : "—"}
                </td>
                <td className="px-3 py-2 text-[13px]">
                  {r.email
                    ? <a href={`mailto:${r.email}`} className="hover:underline">{r.email}</a>
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(r.languages || []).map((c) => (
                      <Chip key={c} tone="default">{LANG_NAME[c] || c}</Chip>
                    ))}
                    {(r.languages || []).length === 0 && "—"}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {r.channel_link ? (
                    <a href={r.channel_link} target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1 text-[12.5px] hover:underline">
                      Open <ExternalLink size={11} />
                    </a>
                  ) : "—"}
                </td>
                <td className="px-3 py-2">
                  {r.website ? (
                    <a href={r.website} target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1 text-[12.5px] hover:underline">
                      Visit <ExternalLink size={11} />
                    </a>
                  ) : <span className="opacity-40">—</span>}
                </td>
                <td className="px-3 py-2 text-[12px] opacity-70 whitespace-nowrap">
                  {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </DashCard>
    </Page>
  );
}
