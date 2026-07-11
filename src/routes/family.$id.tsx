import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BudgetGauge } from "@/components/app/BudgetGauge";
import { SpendingPie } from "@/components/app/SpendingPie";
import { categoryEmoji, categoryLabel, type Category } from "@/components/app/categories";
import { AddMemberModal } from "@/components/family/AddMemberModal";
import { InviteButton } from "@/components/family/InviteButton";
import { AddTransactionSheet } from "@/components/app/AddTransactionSheet";
import { fmtINR, ringStatus } from "@/lib/family";

export const Route = createFileRoute("/family/$id")({
  head: () => ({
    meta: [
      { title: "Family — SpendWise" },
      { name: "description", content: "Shared family budget dashboard on SpendWise." },
    ],
  }),
  component: FamilyDashboard,
  ssr: false,
});

interface Family {
  id: string; name: string; monthly_budget: number;
  alloc_fixed_bills: number; alloc_daily_living: number; alloc_shopping: number; alloc_unplanned: number;
}
interface Member { id: string; name: string; role: string; individual_budget: number; email: string | null; phone: string | null; linked_user_id: string | null; }
interface Tx { id: string; amount: number; category: Category; note: string | null; spent_at: string; member_id: string | null; }

function FamilyDashboard() {
  const { id } = useParams({ from: "/family/$id" });
  const navigate = useNavigate();
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (m: string) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 1800); };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
  }, []);

  async function refresh() {
    const [{ data: f }, { data: ms }, { data: tx }] = await Promise.all([
      supabase.from("families").select("*").eq("id", id).maybeSingle(),
      supabase.from("family_members").select("*").eq("family_id", id).order("created_at"),
      supabase.from("transactions").select("id, amount, category, note, spent_at, member_id").eq("family_id", id).order("spent_at", { ascending: false }),
    ]);
    setFamily(f as any); setMembers((ms as any) ?? []);
    setTxs(((tx as any) ?? []).map((t: any) => ({ ...t, amount: Number(t.amount) })));
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [id]);

  const monthStart = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }, []);
  const monthTx = useMemo(() => txs.filter((t) => new Date(t.spent_at).getTime() >= monthStart), [txs, monthStart]);
  const spent = useMemo(() => monthTx.reduce((s, t) => s + t.amount, 0), [monthTx]);

  const perMember = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of monthTx) if (t.member_id) map.set(t.member_id, (map.get(t.member_id) ?? 0) + t.amount);
    return map;
  }, [monthTx]);

  if (loading) return <main className="min-h-screen grid place-items-center text-muted-foreground text-sm">Loading…</main>;
  if (!family) return <main className="min-h-screen grid place-items-center text-sm">Family not found · <Link to="/" className="underline ml-1">home</Link></main>;

  const status = ringStatus(spent, family.monthly_budget);
  const remaining = Math.max(family.monthly_budget - spent, 0);

  return (
    <main className="min-h-screen bg-background pb-32">
      <header className="px-6 pt-8 pb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/" className="text-xs text-muted-foreground hover:underline">← Dashboard</Link>
          <h1 className="text-2xl font-semibold tracking-tight truncate mt-1">{family.name}</h1>
          <div className="text-xs text-muted-foreground">{members.length} member{members.length === 1 ? "" : "s"}</div>
        </div>
        <button onClick={() => setEditOpen(true)} className="shrink-0 mt-1 px-3 py-1.5 rounded-full border text-xs font-medium">⚙️ Edit</button>
      </header>

      <section className="px-6 flex flex-col items-center">
        <BudgetGauge spent={spent} budget={family.monthly_budget} />
        <div className="mt-3 text-sm numeric">
          Remaining <span className="font-semibold">{fmtINR(remaining)}</span> of {fmtINR(family.monthly_budget)}
        </div>
        <span
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium"
          style={{ background: `color-mix(in oklab, var(--color-${status.tone}) 14%, transparent)`, color: `var(--color-${status.tone})` }}
        >
          <span className="size-1.5 rounded-full" style={{ background: `var(--color-${status.tone})` }} />
          {status.label}
        </span>

        <div className="mt-5 flex gap-2 w-full max-w-xs">
          <InviteButton familyId={family.id} familyName={family.name} budget={family.monthly_budget} onToast={showToast} />
          <button onClick={() => setAddOpen(true)} className="flex-1 py-2.5 rounded-full border text-sm font-medium">+ Member</button>
        </div>
        <button
          onClick={() => setAddExpenseOpen(true)}
          className="mt-3 w-full max-w-xs py-3 rounded-full text-white font-medium text-sm shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
          style={{ background: "var(--color-forest-deep)" }}
        >
          <span className="text-lg leading-none">＋</span> Add family expense
        </button>
      </section>

      <section className="px-6 mt-8">
        <div className="card-soft p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold tracking-tight">Members</h2>
            <span className="text-xs text-muted-foreground">Individual usage</span>
          </div>
          <ul className="divide-y divide-border">
            {members.map((m) => {
              const s = perMember.get(m.id) ?? 0;
              const cap = m.individual_budget > 0 ? m.individual_budget : family.monthly_budget;
              const pct = Math.min(s / Math.max(cap, 1), 1);
              const tone = pct < 0.6 ? "calm" : pct < 0.9 ? "warn" : "danger";
              return (
                <li key={m.id} className="py-3 flex items-center gap-3">
                  <div className="size-10 rounded-xl grid place-items-center font-semibold text-white" style={{ background: "var(--color-forest-deep)" }}>
                    {m.name[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{m.name} <span className="text-[10px] text-muted-foreground uppercase ml-1">{m.role}</span></div>
                    <div className="h-1.5 mt-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full transition-all" style={{ width: `${pct * 100}%`, background: `var(--color-${tone})` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="numeric text-sm font-semibold">{fmtINR(s)}</div>
                    <div className="numeric text-[10px] text-muted-foreground">of {fmtINR(cap)}</div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!confirm(`Remove ${m.name}?`)) return;
                      const { error } = await supabase.from("family_members").delete().eq("id", m.id);
                      if (error) showToast("Couldn't remove"); else refresh();
                    }}
                    className="ml-1 text-muted-foreground hover:text-[var(--color-danger)] text-lg leading-none px-1"
                    aria-label="Remove member"
                  >×</button>
                </li>
              );
            })}
            {members.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No members yet</li>}
          </ul>
        </div>
      </section>

      <SpendingPie transactions={monthTx as any} />

      <section className="px-6 mt-6">
        <div className="card-soft p-5">
          <h2 className="font-semibold tracking-tight mb-3">Recent activity</h2>
          {monthTx.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No shared expenses yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {monthTx.slice(0, 10).map((t) => {
                const who = members.find((m) => m.id === t.member_id)?.name ?? "—";
                return (
                  <li key={t.id} className="py-3 flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-muted grid place-items-center text-lg">{categoryEmoji(t.category)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{t.note || categoryLabel(t.category)}</div>
                      <div className="text-[11px] text-muted-foreground">{who} · {new Date(t.spent_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                    </div>
                    <div className="numeric font-semibold">{fmtINR(t.amount)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <AddMemberModal open={addOpen} onClose={() => setAddOpen(false)} familyId={family.id} onAdded={refresh} />

      {editOpen && (
        <EditFamilyModal
          family={family}
          onClose={() => setEditOpen(false)}
          onSaved={(f) => { setFamily(f); setEditOpen(false); showToast("Family updated"); }}
          onDeleted={async () => {
            if (!confirm(`Delete "${family.name}"? All shared data is removed.`)) return;
            const { error } = await supabase.from("families").delete().eq("id", family.id);
            if (error) return showToast("Couldn't delete");
            navigate({ to: "/" });
          }}
        />
      )}

      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-foreground text-background text-sm shadow-lg">{toastMsg}</div>
      )}
    </main>
  );
}

function EditFamilyModal({ family, onClose, onSaved, onDeleted }: {
  family: Family; onClose: () => void; onSaved: (f: Family) => void; onDeleted: () => void;
}) {
  const [name, setName] = useState(family.name);
  const [budget, setBudget] = useState(String(family.monthly_budget));
  const [saving, setSaving] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md card-soft p-6 rounded-t-3xl sm:rounded-3xl animate-pop">
        <h3 className="text-lg font-semibold tracking-tight">Edit family</h3>
        <p className="text-xs text-muted-foreground">Any member can change these.</p>
        <label className="block mt-4 text-xs uppercase tracking-wider text-muted-foreground">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 50))} className="mt-1 w-full bg-transparent border rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
        <label className="block mt-4 text-xs uppercase tracking-wider text-muted-foreground">Monthly budget (₹)</label>
        <input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} className="numeric mt-1 w-full bg-transparent border rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
        <div className="mt-6 flex gap-2">
          <button onClick={onDeleted} className="px-3 py-3 rounded-xl border text-sm font-medium text-[var(--color-danger)]">Delete</button>
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border font-medium text-sm">Cancel</button>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const b = parseFloat(budget);
              const { data, error } = await supabase.from("families").update({ name: name.trim(), monthly_budget: b }).eq("id", family.id).select("*").single();
              setSaving(false);
              if (error || !data) return;
              onSaved(data as any);
            }}
            className="flex-1 py-3 rounded-xl font-medium text-sm text-white"
            style={{ background: "var(--color-forest-deep)" }}
          >Save</button>
        </div>
      </div>
    </div>
  );
}
